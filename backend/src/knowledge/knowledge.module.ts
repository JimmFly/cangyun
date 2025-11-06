import { Module } from '@nestjs/common';
import { AiModule } from '../ai/index.js';
import { DatabaseModule } from '../database/index.js';
import { KnowledgeService } from './knowledge.service.js';
import { KNOWLEDGE_REPOSITORY_TOKEN } from './knowledge.repository.js';
import { KnowledgeController } from './knowledge.controller.js';
import { PostgresKnowledgeRepository } from './postgres-knowledge.repository.js';

@Module({
  imports: [AiModule, DatabaseModule],
  providers: [
    KnowledgeService,
    {
      provide: KNOWLEDGE_REPOSITORY_TOKEN,
      useClass: PostgresKnowledgeRepository,
    },
    PostgresKnowledgeRepository,
  ],
  controllers: [KnowledgeController],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
