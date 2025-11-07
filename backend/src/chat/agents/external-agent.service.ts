import { Injectable, Logger } from '@nestjs/common';
import { CangyunSearchService } from '../../cangyun/index.js';

export interface ExternalAgentResult {
  agent: 'external';
  success: boolean;
  results: Array<{
    title: string;
    url: string;
    snippet?: string;
  }>;
  note?: string;
  error?: string;
}

/**
 * 外部搜索 Agent
 * 使用 Perplexity 在互联网上搜索攻略站相关信息
 */
@Injectable()
export class ExternalAgentService {
  private readonly logger = new Logger(ExternalAgentService.name);

  constructor(private readonly cangyunSearchService: CangyunSearchService) {}

  async search(
    query: string,
    maxResults: number,
  ): Promise<ExternalAgentResult> {
    try {
      const searchResult = await this.cangyunSearchService.searchDirectly(
        query,
        maxResults,
      );
      // 仅在开发环境记录详细日志
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(
          `[External Agent] Found ${searchResult.results.length} results`,
        );
      }
      return {
        agent: 'external',
        success: true,
        results: searchResult.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        })),
        note: searchResult.note,
      };
    } catch (error) {
      this.logger.error(
        `[External Agent] Search failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        agent: 'external',
        success: false,
        results: [],
        note: '外部搜索异常，已使用知识库资料',
        error: error instanceof Error ? error.message : '外部搜索失败',
      };
    }
  }
}
