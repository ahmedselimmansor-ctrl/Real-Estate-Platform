import { Global, Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

import { AppConfigService } from '../config/app-config.service';
import { ActivityEvent, ActivityEventSchema } from './schemas/activity-event.schema';
import { Property, PropertySchema } from './schemas/property.schema';
import { PropertyView, PropertyViewSchema } from './schemas/property-view.schema';

const mongoModels = MongooseModule.forFeature([
  { name: Property.name, schema: PropertySchema },
  { name: PropertyView.name, schema: PropertyViewSchema },
  { name: ActivityEvent.name, schema: ActivityEventSchema },
]);

/**
 * MongoDB access for the `topchoice` database (CONTRACT §2 — owned by api-core).
 * Registered globally so feature modules only need `@InjectModel(...)`.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const logger = new Logger('MongoModule');

        return {
          uri: config.mongo.uri,
          // Index definitions live in the schemas; let the driver reconcile them.
          autoIndex: true,
          autoCreate: true,
          maxPoolSize: 20,
          minPoolSize: 2,
          serverSelectionTimeoutMS: 10_000,
          socketTimeoutMS: 45_000,
          retryWrites: true,
          connectionFactory: (connection: Connection): Connection => {
            connection.on('connected', () => logger.log('Connected to MongoDB'));
            connection.on('disconnected', () => logger.warn('Disconnected from MongoDB'));
            connection.on('error', (error: Error) =>
              logger.error(`MongoDB connection error: ${error.message}`, error.stack),
            );
            return connection;
          },
        };
      },
    }),
    mongoModels,
  ],
  exports: [MongooseModule],
})
export class MongoModule {}
