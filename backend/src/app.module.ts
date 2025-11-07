import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppConfigModule } from './config/index.js';
import { AiModule } from './ai/index.js';
import { KnowledgeModule } from './knowledge/index.js';
import { ChatModule } from './chat/index.js';
import { GuideModule } from './guide/index.js';

@Module({
  imports: [
    AppConfigModule,
    AiModule,
    KnowledgeModule,
    GuideModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
