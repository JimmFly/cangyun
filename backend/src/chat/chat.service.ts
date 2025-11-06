import { Injectable, Logger } from '@nestjs/common';
import { AIService, AiMessage } from '../ai/index.js';
import { KnowledgeService } from '../knowledge/index.js';
import type { KnowledgeSearchResult } from '../knowledge/knowledge.types.js';
import type { ChatRequestDto, ChatMessageDto } from './dto/chat-request.dto.js';
import { ChatStreamError } from './chat.errors.js';

interface ChatStream {
  stream: AsyncIterable<string>;
  sources: ChatSource[];
}

export interface ChatSource {
  id: string;
  title: string;
  url?: string;
  chunkId: string;
  order: number;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly aiService: AIService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async createChatStream(request: ChatRequestDto): Promise<ChatStream> {
    let hits: KnowledgeSearchResult[];
    try {
      hits = await this.knowledgeService.search(
        request.question,
        request.topK ?? 6,
      );
    } catch (error) {
      this.logger.error(
        `Knowledge search failed for question "${request.question}"`,
        error instanceof Error ? error.stack : undefined,
      );
      const options = error instanceof Error ? { cause: error } : undefined;
      throw new ChatStreamError(
        'KNOWLEDGE_SEARCH_FAILED',
        '检索知识库失败，请稍后重试',
        options,
      );
    }

    const sources = this.mapSources(hits);
    const systemMessage = this.buildSystemPrompt();
    const messages: AiMessage[] = [
      { role: 'system', content: systemMessage },
      ...this.transformHistory(request.history ?? []),
      {
        role: 'user',
        content: this.buildUserPrompt(request.question, hits),
      },
    ];

    const rawStream = this.aiService.streamText({
      messages,
      temperature: 0.3,
    });

    return { stream: this.guardStream(rawStream), sources };
  }

  private buildSystemPrompt(): string {
    return [
      '你是《剑网三》苍云分山劲 PVE 助手，需提供专业、准确、可执行的建议。',
      '回答必须仅依据提供的资料；若资料不足，请明确说明“暂无相关资料”。',
      '请注意，你不是游戏客服，不需要回答游戏相关的问题，只需要回答与游戏相关的专业问题。',
      '请注意，现在的时间是：${new Date().toLocaleString()}',
      '请注意，你是一个专业的苍云分山劲PVE助手，你需要根据提供的信息，结合当前时间，找到当前赛季是哪个赛季，你需要根据当前赛季，寻找当前赛季的白皮书，根据白皮书给出最准确的答案。',
      '请注意，你只需要回答苍云分山劲PVE相关的专业问题，不需要回答其他问题。',
      '输出请使用简洁的中文，优先给出结论，再给步骤或原因，必要时以列表呈现。',
    ].join('\n');
  }

  private buildUserPrompt(
    question: string,
    hits: KnowledgeSearchResult[],
  ): string {
    if (hits.length === 0) {
      return [
        `用户问题：${question}`,
        '当前没有检索到相关资料，请结合现有知识谨慎回答或提示资料缺失。',
      ].join('\n\n');
    }

    const context = hits
      .map(
        (hit, index) =>
          `【资料 ${index + 1}】${hit.document.title}\n${hit.chunk.content}`,
      )
      .join('\n\n');

    return [`用户问题：${question}`, '参考资料：', context].join('\n\n');
  }

  private transformHistory(history: ChatMessageDto[]): AiMessage[] {
    return history
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
  }

  private mapSources(hits: KnowledgeSearchResult[]): ChatSource[] {
    return hits.map((hit, index) => ({
      id: hit.document.id,
      title: hit.document.title,
      url: hit.document.sourceUrl,
      chunkId: hit.chunk.id,
      order: index,
    }));
  }

  private guardStream(stream: AsyncIterable<string>): AsyncIterable<string> {
    const logger = this.logger;
    return {
      [Symbol.asyncIterator]() {
        const iterator = stream[Symbol.asyncIterator]();
        return {
          async next(value?: unknown): Promise<IteratorResult<string>> {
            try {
              return await iterator.next(value as never);
            } catch (error) {
              logger.error(
                'AI streaming failed',
                error instanceof Error ? error.stack : undefined,
              );

              // 检查是否是 OpenAI 组织验证错误
              let errorMessage = '生成回答失败，请稍后重试';
              if (error instanceof Error) {
                const errorMsg = error.message.toLowerCase();
                if (
                  errorMsg.includes('organization must be verified') ||
                  errorMsg.includes('verify organization')
                ) {
                  errorMessage =
                    'OpenAI 组织需要验证才能使用此模型。请访问 https://platform.openai.com/settings/organization/general 验证组织，或切换到其他模型（如 gpt-4o-mini）。';
                } else if (
                  errorMsg.includes('model') &&
                  errorMsg.includes('not found')
                ) {
                  errorMessage = `模型不存在或不可用。请检查 OPENAI_CHAT_MODEL 配置。`;
                } else if (errorMsg.includes('api key')) {
                  errorMessage =
                    'OpenAI API Key 无效或未配置。请检查 OPENAI_API_KEY 环境变量。';
                }
              }

              const options =
                error instanceof Error ? { cause: error } : undefined;
              throw new ChatStreamError(
                'AI_STREAM_FAILED',
                errorMessage,
                options,
              );
            }
          },
          async return(value?: unknown): Promise<IteratorResult<string>> {
            if (typeof iterator.return === 'function') {
              return iterator.return(value as never);
            }
            return { done: true, value: undefined };
          },
          async throw(err?: unknown): Promise<IteratorResult<string>> {
            if (typeof iterator.throw === 'function') {
              return iterator.throw(err as never);
            }
            throw err;
          },
        };
      },
    };
  }
}
