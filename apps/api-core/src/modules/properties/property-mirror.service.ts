import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PropertyStatus as PrismaPropertyStatus } from '@prisma/client';
import { Model } from 'mongoose';

import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { Property, PropertyDocument } from '../../mongo/schemas/property.schema';

/**
 * Keeps the MongoDB listing document and its Postgres `property_index` row in
 * step (CONTRACT §2).
 *
 * There is no distributed transaction across the two engines, so the rule is:
 * **write Mongo first, then Postgres; if Postgres fails, undo the Mongo write.**
 * That ordering means the failure mode is "listing never existed" rather than
 * "listing exists but has no relational row", which would break every join.
 *
 * Isolated here so the compensation path is unit-testable without HTTP.
 */
@Injectable()
export class PropertyMirrorService {
  private readonly logger = new Logger(PropertyMirrorService.name);

  constructor(
    @InjectModel(Property.name) private readonly propertyModel: Model<PropertyDocument>,
    private readonly prisma: PrismaService,
  ) {}

  /** Fields the relational mirror carries — derived, never authored directly. */
  mirrorOf(doc: PropertyDocument): {
    id: string;
    mongoId: string;
    slug: string;
    compoundId: string | null;
    developerId: string | null;
    areaId: string | null;
    priceMin: number;
    status: PrismaPropertyStatus;
    isFeatured: boolean;
    publishedAt: Date | null;
    deletedAt: Date | null;
  } {
    return {
      id: doc.propertyId,
      mongoId: String(doc._id),
      slug: doc.slug,
      compoundId: doc.compound?.id ?? null,
      developerId: doc.developer?.id ?? null,
      areaId: doc.location?.areaId ?? null,
      priceMin: doc.price.amount,
      status: doc.status as PrismaPropertyStatus,
      isFeatured: doc.isFeatured,
      publishedAt: doc.publishedAt ?? null,
      deletedAt: doc.deletedAt ?? null,
    };
  }

  /**
   * Creates the document and its mirror atomically-enough. On a Postgres
   * failure the Mongo document is hard-deleted and the original error surfaces.
   */
  async createWithMirror(data: Partial<Property>): Promise<PropertyDocument> {
    const doc = await this.propertyModel.create(data);

    try {
      await this.prisma.propertyIndex.create({ data: this.mirrorOf(doc) });
      return doc;
    } catch (error) {
      await this.compensate(doc, error);
      throw this.asAppException(error, 'create');
    }
  }

  /**
   * Applies an update to both stores. The pre-update document is captured first
   * so Mongo can be restored if the Postgres write fails.
   */
  async updateWithMirror(
    propertyId: string,
    update: Record<string, unknown>,
  ): Promise<PropertyDocument> {
    const before = await this.propertyModel.findOne({ propertyId }).lean().exec();

    if (!before) {
      throw AppException.notFound(
        `Property "${propertyId}" was not found`,
        ERROR_CODES.PROPERTY_NOT_FOUND,
      );
    }

    const after = await this.propertyModel
      .findOneAndUpdate({ propertyId }, { $set: update }, { new: true, runValidators: true })
      .exec();

    if (!after) {
      throw AppException.notFound(
        `Property "${propertyId}" was not found`,
        ERROR_CODES.PROPERTY_NOT_FOUND,
      );
    }

    try {
      const mirror = this.mirrorOf(after);
      await this.prisma.propertyIndex.update({
        where: { id: propertyId },
        data: {
          slug: mirror.slug,
          compoundId: mirror.compoundId,
          developerId: mirror.developerId,
          areaId: mirror.areaId,
          priceMin: mirror.priceMin,
          status: mirror.status,
          isFeatured: mirror.isFeatured,
          publishedAt: mirror.publishedAt,
          deletedAt: mirror.deletedAt,
        },
      });
      return after;
    } catch (error) {
      // Restore the previous document so the two stores stay consistent.
      const { _id, ...restorable } = before as Record<string, unknown> & { _id: unknown };
      await this.propertyModel
        .replaceOne({ propertyId }, restorable)
        .exec()
        .catch((rollbackError: unknown) => {
          this.logger.error(
            `CRITICAL: property ${propertyId} is out of sync — Postgres update failed and the ` +
              `Mongo rollback also failed: ${String(rollbackError)}`,
          );
        });
      throw this.asAppException(error, 'update');
    }
  }

  /** Soft delete in both stores. */
  async softDeleteWithMirror(propertyId: string): Promise<void> {
    const deletedAt = new Date();

    const result = await this.propertyModel
      .updateOne({ propertyId, deletedAt: null }, { $set: { deletedAt } })
      .exec();

    if (result.matchedCount === 0) {
      throw AppException.notFound(
        `Property "${propertyId}" was not found`,
        ERROR_CODES.PROPERTY_NOT_FOUND,
      );
    }

    try {
      await this.prisma.propertyIndex.update({ where: { id: propertyId }, data: { deletedAt } });
    } catch (error) {
      await this.propertyModel
        .updateOne({ propertyId }, { $set: { deletedAt: null } })
        .exec()
        .catch(() => undefined);
      throw this.asAppException(error, 'delete');
    }
  }

  private async compensate(doc: PropertyDocument, cause: unknown): Promise<void> {
    this.logger.warn(
      `Postgres mirror failed for property ${doc.propertyId} (${String(cause)}) — rolling back the Mongo write`,
    );

    await this.propertyModel
      .deleteOne({ _id: doc._id })
      .exec()
      .catch((rollbackError: unknown) => {
        this.logger.error(
          `CRITICAL: orphaned Mongo property ${doc.propertyId} could not be rolled back: ${String(rollbackError)}`,
        );
      });
  }

  private asAppException(error: unknown, operation: string): AppException {
    if (error instanceof AppException) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('Unique constraint') || message.includes('P2002')) {
      return AppException.conflict(
        'A property with this slug or reference number already exists',
        ERROR_CODES.DUPLICATE_RESOURCE,
      );
    }

    if (message.includes('Foreign key constraint') || message.includes('P2003')) {
      return AppException.badRequest(
        'The compound, developer or area referenced by this listing does not exist',
        ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
      );
    }

    return AppException.internal(
      `Could not ${operation} the listing — the relational mirror rejected the write`,
      ERROR_CODES.DATABASE_ERROR,
    );
  }
}
