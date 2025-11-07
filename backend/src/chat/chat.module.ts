import { Module } from '@nestjs/common';
import { AiModule } from '../ai/index.js';
import { KnowledgeModule } from '../knowledge/index.js';
import { CangyunModule } from '../cangyun/index.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { KnowledgeAgentService } from './agents/knowledge-agent.service.js';
import { ExternalAgentService } from './agents/external-agent.service.js';
import { CoordinatorAgentService } from './agents/coordinator-agent.service.js';

@Module({
  imports: [AiModule, KnowledgeModule, CangyunModule],
  providers: [
    ChatService,
    KnowledgeAgentService,
    ExternalAgentService,
    CoordinatorAgentService,
  ],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
