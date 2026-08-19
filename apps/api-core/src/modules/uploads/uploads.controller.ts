import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipResponseTransform } from '../../common/decorators/skip-response-transform.decorator';
import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { DeleteUploadDto, PresignUploadDto } from './dto/upload.dto';
import { LocalStorageDriver } from './storage/local.driver';
import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES } from './storage/storage.driver';
import { PresignResult, UploadsService } from './uploads.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Roles('agent', 'admin')
  @ApiBearerAuth()
  @Post('presign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a presigned upload URL',
    description:
      'Returns `{uploadUrl, key, publicUrl}`. PUT the bytes straight to `uploadUrl` with the ' +
      'returned `requiredHeaders`, then store `key`/`publicUrl` on the listing. ' +
      'Backed by S3 when AWS credentials are set, otherwise by local disk.',
  })
  presign(@Body() dto: PresignUploadDto): Promise<PresignResult> {
    return this.uploads.presign(dto);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Delete()
  @ApiOperation({ summary: 'Delete an object from storage' })
  remove(@Body() dto: DeleteUploadDto): Promise<{ key: string; deleted: true }> {
    return this.uploads.remove(dto.key);
  }

  // ------------------------------------------------- local driver endpoints --
  // Only reachable when AWS credentials are absent. With S3 configured the
  // browser PUTs straight to the bucket and these never run.

  @Public()
  @Put('local')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async uploadLocal(
    @Query('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: Request,
  ): Promise<{ key: string; uploaded: true; publicUrl: string }> {
    const driver = this.localDriver();

    if (!key || !exp || !sig) {
      throw AppException.badRequest('key, exp and sig are all required', ERROR_CODES.BAD_REQUEST);
    }

    driver.verifyUploadSignature(key, Number.parseInt(exp, 10), sig);

    if (contentType && !(contentType.split(';')[0].trim() in ALLOWED_CONTENT_TYPES)) {
      throw AppException.badRequest(
        `Unsupported content type "${contentType}"`,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const declared = Number.parseInt(contentLength ?? '0', 10);
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
      throw AppException.badRequest(
        `Uploads are limited to ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
        ERROR_CODES.PAYLOAD_TOO_LARGE,
      );
    }

    const target = await driver.ensureDirectoryFor(key);

    // Enforce the cap on the actual stream too — Content-Length can lie.
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_UPLOAD_BYTES) {
        req.destroy(new Error('upload exceeded the maximum size'));
      }
    });

    try {
      await pipeline(req, createWriteStream(target));
    } catch (error) {
      await driver.delete(key).catch(() => undefined);
      throw AppException.badRequest(
        `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.UPLOAD_FAILED,
      );
    }

    return { key, uploaded: true, publicUrl: driver.publicUrl(key) };
  }

  @Public()
  @SkipResponseTransform()
  @Get('file')
  @ApiExcludeEndpoint()
  async serveLocal(@Query('key') key: string, @Res() res: Response): Promise<void> {
    const driver = this.localDriver();

    if (!key || !(await driver.exists(key))) {
      throw AppException.notFound('Object not found', ERROR_CODES.NOT_FOUND);
    }

    const extension = key.split('.').pop()?.toLowerCase() ?? '';
    const contentType =
      Object.entries(ALLOWED_CONTENT_TYPES).find(([, ext]) => ext === extension)?.[0] ??
      'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', await driver.sizeOf(key));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    driver.createReadStream(key).pipe(res);
  }

  private localDriver(): LocalStorageDriver {
    const driver = this.uploads.driver;

    if (!(driver instanceof LocalStorageDriver)) {
      throw AppException.notFound(
        'This deployment uploads directly to S3 — use the presigned URL instead',
        ERROR_CODES.NOT_FOUND,
      );
    }

    return driver;
  }
}
