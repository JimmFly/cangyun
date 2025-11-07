import { Module } from '@nestjs/common';
import { CangyunSearchService } from './cangyun-search.service.js';

@Module({
  providers: [CangyunSearchService],
  exports: [CangyunSearchService],
})
export class CangyunModule {}
