import { Module } from '@nestjs/common';

import { AreasModule } from '../areas/areas.module';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { PropertyMirrorService } from './property-mirror.service';
import { SearchIndexClient } from './search-index.client';

/**
 * The Mongoose models are registered globally by `MongoModule`, so this module
 * only wires the property-specific services.
 */
@Module({
  imports: [AreasModule],
  controllers: [PropertiesController],
  providers: [PropertiesService, PropertyMirrorService, SearchIndexClient],
  exports: [PropertiesService, PropertyMirrorService, SearchIndexClient],
})
export class PropertiesModule {}
