import { Module } from '@nestjs/common';
import { AiModule } from '../ai/index.js';
import { KnowledgeModule } from '../knowledge/index.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';

@Module({
  imports: [AiModule, KnowledgeModule],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
