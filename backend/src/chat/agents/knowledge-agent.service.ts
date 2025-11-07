import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeService } from '../../knowledge/index.js';
import type { KnowledgeSearchResult } from '../../knowledge/knowledge.types.js';

export interface KnowledgeAgentResult {
  agent: 'knowledge';
  success: boolean;
  results: KnowledgeSearchResult[];
  error?: string;
}

/**
 * 知识库搜索 Agent
 * 使用 OpenAI 向量搜索在本地知识库中检索相关信息
 */
@Injectable()
export class KnowledgeAgentService {
  private readonly logger = new Logger(KnowledgeAgentService.name);

  constructor(private readonly knowledgeService: KnowledgeService) {}

  async search(query: string, topK: number): Promise<KnowledgeAgentResult> {
    try {
      const results = await this.knowledgeService.search(query, topK);
      // 仅在开发环境记录详细日志
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(
          `[Knowledge Agent] Found ${results.length} results for: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`,
        );
      }
      return {
        agent: 'knowledge',
        success: true,
        results,
      };
    } catch (error) {
      this.logger.error(
        `[Knowledge Agent] Search failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        agent: 'knowledge',
        success: false,
        results: [],
        error: error instanceof Error ? error.message : '知识库搜索失败',
      };
    }
  }
}
