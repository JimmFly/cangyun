import { Injectable, Logger } from '@nestjs/common';
import type { ChatMessageDto, ChatRequestDto } from './dto/chat-request.dto.js';
import { ChatStreamError } from './chat.errors.js';
import { KnowledgeAgentService } from './agents/knowledge-agent.service.js';
import { ExternalAgentService } from './agents/external-agent.service.js';
import { CoordinatorAgentService } from './agents/coordinator-agent.service.js';
import type { KnowledgeSearchResult } from '../knowledge/knowledge.types.js';

const CONTEXT_QUERY_MAX_LENGTH = 400;

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
  sourceType?: 'knowledge' | 'external';
}

/**
 * 多 Agent 协作的聊天服务
 * - KnowledgeAgent: 使用 OpenAI 进行知识库向量搜索
 * - ExternalAgent: 使用 Perplexity 进行联网搜索
 * - CoordinatorAgent: 使用 OpenAI 整合两个 Agent 的结果，生成最终答案
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly knowledgeAgent: KnowledgeAgentService,
    private readonly externalAgent: ExternalAgentService,
    private readonly coordinatorAgent: CoordinatorAgentService,
  ) {}

  async createChatStream(
    request: ChatRequestDto,
    onStatus?: (status: {
      step: string;
      label: string;
      tool?: string;
      agent?: string;
    }) => void,
  ): Promise<ChatStream> {
    const trimmedQuestion = request.question.trim();
    const contextAwareQuestion = this.buildContextAwareQuestion(
      trimmedQuestion,
      request.history,
    );
    const knowledgeQuery = this.enhanceSearchQuery(contextAwareQuestion);

    // 步骤 1: 并行执行两个 Agent 的搜索任务
    onStatus?.({
      step: 'searching',
      label: '正在搜索知识库和外部资源...',
      tool: '并行搜索',
      agent: 'Multi-Agent',
    });

    // 仅在开发环境记录详细日志
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(
        `[Multi-Agent] Starting parallel search for: "${trimmedQuestion}"`,
      );
    }

    // 启动知识库搜索
    onStatus?.({
      step: 'searching-knowledge',
      label: '正在使用 OpenAI 向量搜索知识库...',
      tool: 'OpenAI Embeddings',
      agent: 'KnowledgeAgent',
    });

    // 启动外部搜索
    onStatus?.({
      step: 'searching-external',
      label: '正在使用 Perplexity 搜索外部资源...',
      tool: 'Perplexity API',
      agent: 'ExternalAgent',
    });

    const [knowledgeResult, externalResult] = await Promise.all([
      // Agent 1: 知识库搜索 Agent（OpenAI 向量搜索）
      this.knowledgeAgent.search(knowledgeQuery, request.topK ?? 6),
      // Agent 2: 外部搜索 Agent（Perplexity 联网搜索）
      this.externalAgent.search(contextAwareQuestion, request.topK ?? 6),
    ]);

    // 仅在开发环境或失败时记录日志
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(
        `[Multi-Agent] Knowledge: ${knowledgeResult.results.length} results, External: ${externalResult.results.length} results`,
      );
    } else if (!knowledgeResult.success || !externalResult.success) {
      this.logger.warn(
        `[Multi-Agent] Search issues - Knowledge: ${knowledgeResult.success ? 'ok' : 'failed'}, External: ${externalResult.success ? 'ok' : 'failed'}`,
      );
    }

    // 步骤 2: 构建 sources 列表
    onStatus?.({
      step: 'processing',
      label: '正在整理搜索结果...',
      tool: '数据处理',
      agent: 'CoordinatorAgent',
    });
    const sources: ChatSource[] = this.buildKnowledgeSources(
      knowledgeResult.results,
    );
    externalResult.results.forEach((result) => {
      this.addExternalSource(sources, {
        title: result.title,
        url: result.url,
      });
    });

    // 步骤 3: 协调 Agent 生成最终答案（支持自动续上）
    const accumulatedContent = { value: '' };
    let retryCount = 0;
    const maxRetries = 2; // 最多重试2次

    const createStream = (): AsyncIterable<string> => {
      onStatus?.({
        step: 'generating',
        label:
          retryCount > 0
            ? `正在续写回答... (${retryCount}/${maxRetries})`
            : '正在使用 OpenAI 生成回答...',
        tool: 'OpenAI GPT-4',
        agent: 'CoordinatorAgent',
      });
      return this.coordinatorAgent.generateAnswer({
        question: trimmedQuestion,
        knowledgeResults: knowledgeResult,
        externalResults: externalResult,
        history: request.history,
        accumulatedContent:
          accumulatedContent.value.length > 0
            ? accumulatedContent.value
            : undefined,
      });
    };

    // 创建一个支持自动续上的流
    const createResumableStream = (): AsyncIterable<string> => {
      const logger = this.logger;
      const guardStreamFn = this.guardStream.bind(this);
      return {
        [Symbol.asyncIterator]() {
          let currentStream = createStream();
          let currentIterator = guardStreamFn(
            currentStream,
            accumulatedContent,
          )[Symbol.asyncIterator]();
          let isDone = false;

          const nextFn = async (): Promise<IteratorResult<string>> => {
            if (isDone) {
              return { done: true, value: undefined };
            }

            try {
              const result = await currentIterator.next();
              if (result.done) {
                isDone = true;
              }
              return result;
            } catch (error) {
              // 检查是否是网络错误且有已生成内容
              const isNetworkError =
                error instanceof ChatStreamError &&
                error.code === 'STREAM_NETWORK_ERROR' &&
                (error as ChatStreamError & { accumulatedContent?: string })
                  .accumulatedContent &&
                (error as ChatStreamError & { accumulatedContent?: string })
                  .accumulatedContent!.length > 0;

              if (isNetworkError && retryCount < maxRetries) {
                const savedContent = (
                  error as ChatStreamError & { accumulatedContent: string }
                ).accumulatedContent;
                accumulatedContent.value = savedContent;
                retryCount++;

                logger.warn(
                  `Attempting to resume stream (retry ${retryCount}/${maxRetries}) with ${savedContent.length} chars`,
                );

                // 创建新的流继续生成
                currentStream = createStream();
                currentIterator = guardStreamFn(
                  currentStream,
                  accumulatedContent,
                )[Symbol.asyncIterator]();

                // 继续迭代
                return nextFn();
              }

              // 无法续上或超过重试次数，抛出错误
              throw error;
            }
          };

          return {
            next: nextFn,
          };
        },
      };
    };

    return {
      stream: createResumableStream(),
      sources,
    };
  }

  /**
   * 增强搜索查询，添加优先级关键词
   */
  private enhanceSearchQuery(query: string): string {
    const lowerQuery = query.toLowerCase();
    let enhanced = query;

    // 检查是否是基础机制相关查询
    const isMechanicQuery =
      lowerQuery.includes('怒气') ||
      lowerQuery.includes('调息') ||
      lowerQuery.includes('cd') ||
      lowerQuery.includes('机制') ||
      lowerQuery.includes('基础') ||
      lowerQuery.includes('原理') ||
      lowerQuery.includes('怎么') ||
      lowerQuery.includes('如何') ||
      lowerQuery.includes('为什么');

    // 检查是否是技能和奇穴相关查询
    const isSkillQuery =
      lowerQuery.includes('技能') ||
      lowerQuery.includes('奇穴') ||
      lowerQuery.includes('效果') ||
      lowerQuery.includes('描述') ||
      lowerQuery.includes('作用') ||
      lowerQuery.includes('伤害') ||
      lowerQuery.includes('buff') ||
      lowerQuery.includes('debuff');

    // 检查是否是奇穴相关查询（需要特别优先"山海源流-苍云技改.md"）
    const isQixueQuery =
      lowerQuery.includes('奇穴') ||
      lowerQuery.includes('qixue') ||
      lowerQuery.includes('奇穴点') ||
      lowerQuery.includes('奇穴选择') ||
      lowerQuery.includes('奇穴搭配') ||
      lowerQuery.includes('奇穴效果') ||
      lowerQuery.includes('奇穴描述');

    // 检查是否是副本相关查询
    const isRaidQuery =
      lowerQuery.includes('副本') ||
      lowerQuery.includes('raid') ||
      lowerQuery.includes('弓月城') ||
      lowerQuery.includes('一之窟') ||
      lowerQuery.includes('太极宫') ||
      lowerQuery.includes('空城殿');

    // 检查是否是赛季/技改相关查询
    const isSeasonQuery =
      lowerQuery.includes('赛季') ||
      lowerQuery.includes('技改') ||
      lowerQuery.includes('改动') ||
      lowerQuery.includes('当前') ||
      lowerQuery.includes('现在') ||
      lowerQuery.includes('第几');

    // 如果查询中没有明确提到山海源流，但涉及赛季/技改，添加权重
    if (isSeasonQuery && !lowerQuery.includes('山海源流')) {
      enhanced = `${query} 山海源流`;
    }

    // 如果查询中没有明确提到弓月城，但涉及副本，添加权重
    if (isRaidQuery && !lowerQuery.includes('弓月城')) {
      enhanced = `${query} 弓月城 会战弓月城 普通弓月城 英雄弓月城`;
    }

    // 如果涉及基础机制，添加"苍云进阶机制"关键词
    if (isMechanicQuery && !lowerQuery.includes('进阶机制')) {
      enhanced = `${query} 苍云进阶机制`;
    }

    // 如果涉及奇穴，必须优先添加"山海源流"和"苍云技改"关键词
    if (isQixueQuery) {
      enhanced = `${query} 山海源流 苍云技改 山海源流-苍云技改`;
    }
    // 如果涉及技能和奇穴（但不是纯奇穴查询），添加"太极秘录"关键词
    else if (isSkillQuery && !lowerQuery.includes('太极秘录')) {
      enhanced = `${query} 太极秘录 分山劲白皮书`;
    }

    return enhanced;
  }

  private buildKnowledgeSources(hits: KnowledgeSearchResult[]): ChatSource[] {
    return hits.map((hit, index) => ({
      id: hit.document.id,
      title: hit.document.title,
      url: hit.document.sourceUrl,
      chunkId: hit.chunk.id,
      order: index,
      sourceType: 'knowledge' as const,
    }));
  }

  private addExternalSource(
    sources: ChatSource[],
    { title, url }: { title: string; url: string },
  ): void {
    const existing = sources.find((s) => s.url === url);
    if (existing) {
      return;
    }

    sources.push({
      id: `external-${sources.length}`,
      title,
      url,
      chunkId: `external-${sources.length}`,
      order: sources.length,
      sourceType: 'external' as const,
    });
  }

  private guardStream(
    stream: AsyncIterable<string>,
    accumulatedContent?: { value: string },
  ): AsyncIterable<string> {
    const logger = this.logger;
    let deltaCount = 0;
    let contentBuffer = accumulatedContent?.value ?? '';
    return {
      [Symbol.asyncIterator]() {
        const iterator = stream[Symbol.asyncIterator]();
        return {
          async next(value?: unknown): Promise<IteratorResult<string>> {
            try {
              const result = await iterator.next(value as never);
              if (!result.done && typeof result.value === 'string') {
                deltaCount++;
                contentBuffer += result.value;
                if (deltaCount === 1) {
                  logger.debug('First AI delta received');
                }
                if (deltaCount % 10 === 0) {
                  logger.debug(`Received ${deltaCount} deltas so far`);
                }
              }
              return result;
            } catch (error) {
              // 检查是否是网络中断错误
              const isNetworkError =
                error instanceof Error &&
                (error.message === 'terminated' ||
                  error.message.includes('terminated') ||
                  error.name === 'AbortError' ||
                  error.message.includes('fetch failed') ||
                  error.message.includes('ECONNREFUSED') ||
                  error.message.includes('ETIMEDOUT'));

              if (isNetworkError) {
                logger.warn(
                  `AI streaming interrupted after ${deltaCount} deltas (network error), accumulated ${contentBuffer.length} chars`,
                  error instanceof Error ? error.message : String(error),
                );
                // 保存已生成的内容到错误中，以便续上
                const networkError = new ChatStreamError(
                  'STREAM_NETWORK_ERROR',
                  '网络连接中断，AI 流式输出被终止',
                  error instanceof Error ? { cause: error } : undefined,
                );
                (
                  networkError as ChatStreamError & {
                    accumulatedContent: string;
                  }
                ).accumulatedContent = contentBuffer;
                throw networkError;
              } else {
                logger.error(
                  `AI streaming failed after ${deltaCount} deltas`,
                  error instanceof Error ? error.stack : undefined,
                );
                throw new ChatStreamError(
                  'STREAM_ERROR',
                  'AI 流式输出异常',
                  error instanceof Error ? { cause: error } : undefined,
                );
              }
            }
          },
          async return(value?: unknown): Promise<IteratorResult<string>> {
            if (typeof iterator.return === 'function') {
              return iterator.return(value as never);
            }
            return { done: true, value: undefined };
          },
          async throw(err?: unknown): Promise<IteratorResult<string>> {
            logger.error(
              'Stream error',
              err instanceof Error ? err.stack : undefined,
            );
            if (typeof iterator.throw === 'function') {
              return iterator.throw(err as never);
            }
            throw err;
          },
        };
      },
    };
  }

  private buildContextAwareQuestion(
    question: string,
    history?: ChatMessageDto[],
  ): string {
    const trimmed = question.trim();
    if (!history?.length) {
      return trimmed;
    }

    if (!this.isFollowUpQuestion(trimmed)) {
      return trimmed;
    }

    const latestUserContext = this.extractLatestUserQuestion(history);
    if (!latestUserContext) {
      return trimmed;
    }

    const combined = `${latestUserContext} ${trimmed}`.trim();
    if (combined === trimmed) {
      return trimmed;
    }

    return this.truncateQuery(combined, CONTEXT_QUERY_MAX_LENGTH);
  }

  private isFollowUpQuestion(question: string): boolean {
    const normalized = question.replace(/\s+/g, '');
    if (normalized.length === 0) {
      return false;
    }

    if (normalized.length <= 10) {
      return true;
    }

    const prefixKeywords = [
      '那',
      '那么',
      '然后',
      '还有',
      '再',
      '另外',
      '接着',
      '此外',
    ];
    if (prefixKeywords.some((keyword) => normalized.startsWith(keyword))) {
      return true;
    }

    const pronounKeywords = [
      '这些',
      '那些',
      '这个',
      '那个',
      '上述',
      '上面',
      '这样',
      '这么',
      '对此',
    ];

    return pronounKeywords.some((keyword) => normalized.includes(keyword));
  }

  private extractLatestUserQuestion(
    history: ChatMessageDto[],
  ): string | undefined {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const message = history[index];
      if (message.role !== 'user') {
        continue;
      }
      const trimmed = message.content.trim();
      if (trimmed.length === 0) {
        continue;
      }
      return trimmed;
    }
    return undefined;
  }

  private truncateQuery(input: string, limit: number): string {
    if (input.length <= limit) {
      return input;
    }
    return input.slice(input.length - limit);
  }
}
