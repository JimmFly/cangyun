import { Module } from '@nestjs/common';
import { GuideService } from './guide.service.js';

@Module({
  providers: [GuideService],
  exports: [GuideService],
})
export class GuideModule {}
