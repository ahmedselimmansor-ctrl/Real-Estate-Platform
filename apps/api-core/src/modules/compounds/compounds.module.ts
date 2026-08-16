import { Module } from '@nestjs/common';

import { DevelopersModule } from '../developers/developers.module';
import { CompoundsController } from './compounds.controller';
import { CompoundsService } from './compounds.service';

@Module({
  imports: [DevelopersModule],
  controllers: [CompoundsController],
  providers: [CompoundsService],
  exports: [CompoundsService],
})
export class CompoundsModule {}
