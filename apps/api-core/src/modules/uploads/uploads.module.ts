import { Module, Provider } from '@nestjs/common';
import { resolve } from 'node:path';

import { AppConfigService } from '../../config/app-config.service';
import { LocalStorageDriver } from './storage/local.driver';
import { S3StorageDriver } from './storage/s3.driver';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage.driver';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

/**
 * Picks the storage backend from configuration: real S3 when AWS credentials
 * are present, otherwise the local-disk driver so the stack runs keyless.
 */
const storageDriverProvider: Provider = {
  provide: STORAGE_DRIVER,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService): StorageDriver => {
    if (config.storage.enabled) {
      return new S3StorageDriver(config.storage);
    }

    const driver = new LocalStorageDriver({
      rootDir: resolve(process.env.LOCAL_UPLOAD_DIR ?? './uploads'),
      publicApiUrl: config.app.publicApiUrl,
      signingSecret: config.app.internalServiceToken,
    });

    driver.logStartup();
    return driver;
  },
};

@Module({
  controllers: [UploadsController],
  providers: [storageDriverProvider, UploadsService],
  exports: [UploadsService, storageDriverProvider],
})
export class UploadsModule {}
