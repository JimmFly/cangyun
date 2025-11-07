import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { AppConfig, IntegrationsConfig } from '../config/index.js';

// 允许的攻略站域名
const ALLOWED_DOMAINS = ['yuque.com', 'jx3box.com', 'xoyo.com'] as const;

// 允许的攻略站路径前缀
const ALLOWED_PATH_PREFIXES = [
  'https://www.yuque.com/sgyxy/cangyun',
  'https://www.jx3box.com',
  'https://daily.xoyo.com',
] as const;

const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_MAX_CHARS = 8000;
const DEFAULT_TIMEOUT_MS = 3000;
const PERPLEXITY_SEARCH_TIMEOUT_MS = 20000; // 20 seconds for Perplexity search

interface PerplexitySearchItem {
  title: string;
  url: string;
  snippet?: string;
}

interface PerplexitySearchResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  notExactPath?: boolean;
  priorityScore?: number;
}

interface FetchPageResult {
  url: string;
  text: string;
}

interface CachedValue<T> {
  value: T;
  expiresAt: number;
}

interface RegisterSourcePayload {
  title: string;
  url: string;
}

interface CreateToolsOptions {
  registerSource?: (payload: RegisterSourcePayload) => void;
}

interface SearchToolResult {
  results: SearchResult[];
  note?: string;
}

const stripHtml = (html: string): string =>
  html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function withTimeout<T>(
  promise: Promise<T>,
  ms = DEFAULT_TIMEOUT_MS,
  abort?: AbortController,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        abort?.abort();
      } catch {
        // ignore abort errors
      }
      reject(new Error('timeout'));
    }, ms);
    promise
      .then((v) => resolve(v))
      .catch((e) => reject(e instanceof Error ? e : new Error(String(e))))
      .finally(() => clearTimeout(timer));
  });
}

@Injectable()
export class CangyunSearchService {
  private readonly logger = new Logger(CangyunSearchService.name);
  private readonly perplexityApiKey?: string;
  private readonly searchCache = new Map<
    string,
    CachedValue<SearchToolResult>
  >();
  private readonly pageCache = new Map<string, CachedValue<FetchPageResult>>();
  private readonly metadataByUrl = new Map<
    string,
    { title: string; snippet: string }
  >();

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const integrations =
      this.configService.get<IntegrationsConfig>('integrations');
    if (
      integrations &&
      'perplexity' in integrations &&
      integrations.perplexity &&
      'apiKey' in integrations.perplexity
    ) {
      const apiKey = integrations.perplexity.apiKey;
      if (apiKey && typeof apiKey === 'string') {
        this.perplexityApiKey = apiKey.trim() || undefined;
      }
    }
  }

  /**
   * 直接执行搜索（不通过工具），用于在 chat.service 中并行调用
   */
  async searchDirectly(
    query: string,
    maxResults = 6,
  ): Promise<SearchToolResult> {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return { results: [] };
    }

    const limit = maxResults;
    const cacheKey = `${trimmedQuery}::${limit}`;
    const cached = this.getFromCache(this.searchCache, cacheKey);
    if (cached) {
      return cached;
    }

    if (!this.perplexityApiKey) {
      return { results: [], note: '搜索未配置（PERPLEXITY_API_KEY 缺失）' };
    }

    try {
      const controller = new AbortController();
      // 构造 Perplexity 查询，要求返回 JSON 格式的结构化结果
      // 检测查询类型，增强搜索提示
      const queryLower = trimmedQuery.toLowerCase();
      const isSeasonQueryType =
        queryLower.includes('赛季') ||
        queryLower.includes('技改') ||
        queryLower.includes('改动');
      const isRaidQueryType =
        queryLower.includes('副本') ||
        queryLower.includes('raid') ||
        queryLower.includes('弓月城') ||
        queryLower.includes('一之窟') ||
        queryLower.includes('太极宫') ||
        queryLower.includes('空城殿');

      let priorityHint = '';
      if (isSeasonQueryType && !queryLower.includes('山海源流')) {
        priorityHint =
          '\n\n重要：当前赛季是"山海源流"赛季，请优先返回标题包含"山海源流"的文档。';
      }
      if (isRaidQueryType && !queryLower.includes('弓月城')) {
        priorityHint +=
          '\n\n重要：请优先返回标题包含"弓月城"、"会战弓月城"、"普通弓月城"、"英雄弓月城"的文档。';
      }

      const searchPrompt = `请搜索以下问题，查找来自以下攻略站的文档：
- 语雀苍云空间：https://www.yuque.com/sgyxy/cangyun
- 剑三魔盒：https://www.jx3box.com
- 每日攻略：https://daily.xoyo.com
- 其他 xoyo.com 子域名（如 kefu.xoyo.com 等）

要求：
1. 返回最多 ${limit} 条相关结果${priorityHint}
2. 每条结果必须包含：title（文档标题）、url（完整链接，必须来自上述网站）、snippet（简要片段，100字以内）
3. 仅返回 JSON 数组格式，不要任何其他文字说明、markdown 代码块标记或解释
4. 如果找不到相关内容，返回空数组 []

搜索问题：${trimmedQuery}

请直接返回 JSON 数组，格式示例：
[{"title": "文档标题", "url": "https://www.yuque.com/sgyxy/cangyun/xxx", "snippet": "简要内容..."}]`;

      const response = await withTimeout(
        fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.perplexityApiKey}`,
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [
              {
                role: 'system',
                content:
                  '你是一个专业的搜索助手，擅长从多个攻略站（语雀苍云空间、剑三魔盒、每日攻略）查找攻略文档。请严格按照要求返回 JSON 格式的结果。',
              },
              {
                role: 'user',
                content: searchPrompt,
              },
            ],
            temperature: 0.2,
            max_tokens: 2000,
          }),
          signal: controller.signal,
        }),
        PERPLEXITY_SEARCH_TIMEOUT_MS, // Perplexity 搜索需要更长时间
        controller,
      );

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(
          `Perplexity 搜索失败（${response.status}）：${text || '无响应正文'}`,
        );
        return { results: [], note: `搜索失败(${response.status})` };
      }

      const raw = (await response.json()) as PerplexitySearchResponse;
      const content = raw.choices?.[0]?.message?.content?.trim() ?? '';

      if (!content) {
        this.logger.warn('Perplexity 返回空内容');
        return { results: [], note: '未找到相关内容' };
      }

      // 仅在开发环境记录原始返回内容
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(
          `Perplexity 原始返回内容（前500字符）：${content.slice(0, 500)}`,
        );
      }

      // 尝试从返回内容中提取 JSON
      let parsedResults: PerplexitySearchItem[] = [];
      try {
        // 先尝试移除 markdown 代码块标记
        let cleanedContent = content.trim();
        if (cleanedContent.startsWith('```')) {
          // 移除开头的 ```json 或 ```
          cleanedContent = cleanedContent.replace(/^```(?:json)?\s*/i, '');
          // 移除结尾的 ```
          cleanedContent = cleanedContent.replace(/\s*```\s*$/, '');
        }

        // 尝试提取 JSON 数组（匹配最外层的中括号）
        const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsedResults = JSON.parse(jsonMatch[0]) as PerplexitySearchItem[];
        } else {
          // 如果没有找到数组，尝试直接解析整个内容
          parsedResults = JSON.parse(cleanedContent) as PerplexitySearchItem[];
        }
      } catch (parseError) {
        const errorMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        this.logger.warn(
          `Perplexity 返回内容无法解析为 JSON (${errorMsg}): ${content.slice(0, 300)}`,
        );
        // 尝试从文本中提取链接（支持多个攻略站）
        const urlPatterns = [
          // 语雀苍云空间
          /https?:\/\/[^/]*yuque\.com\/sgyxy\/cangyun\/[^\s)"']+/g,
          /https?:\/\/www\.yuque\.com\/sgyxy\/cangyun\/[^\s)"']+/g,
          // 剑三魔盒
          /https?:\/\/[^/]*jx3box\.com\/[^\s)"']+/g,
          /https?:\/\/www\.jx3box\.com\/[^\s)"']+/g,
          // 每日攻略和其他 xoyo.com 子域名
          /https?:\/\/daily\.xoyo\.com\/[^\s)"']+/g,
          /https?:\/\/[^/]*\.xoyo\.com\/[^\s)"']+/g,
          /https?:\/\/xoyo\.com\/[^\s)"']+/g,
        ];
        const extractedUrls: string[] = [];
        for (const pattern of urlPatterns) {
          const matches = content.matchAll(pattern);
          for (const match of matches) {
            if (match[0] && !extractedUrls.includes(match[0])) {
              extractedUrls.push(match[0]);
            }
          }
        }
        if (extractedUrls.length > 0) {
          parsedResults = extractedUrls.map((url) => ({
            title:
              url
                .split('/')
                .pop()
                ?.replace(/[?#].*$/, '') ?? url,
            url,
            snippet: '',
          }));
          if (process.env.NODE_ENV === 'development') {
            this.logger.debug(`从文本中提取到 ${extractedUrls.length} 个链接`);
          }
        }
      }

      // 记录结果统计（即使是非开发环境也记录，帮助诊断问题）
      if (parsedResults.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          this.logger.debug(
            `Perplexity 返回 ${parsedResults.length} 条原始结果`,
          );
        }
      } else {
        // 如果没有解析到结果，记录警告（帮助诊断）
        this.logger.warn(
          `Perplexity 搜索 "${trimmedQuery}" 解析后无结果，原始内容长度: ${content.length}`,
        );
        if (process.env.NODE_ENV === 'development') {
          this.logger.debug(`原始内容预览: ${content.slice(0, 500)}`);
        }
      }

      // 检测查询类型，用于优先级排序
      const queryLowerForSort = trimmedQuery.toLowerCase();
      const isSeasonQueryForSort =
        queryLowerForSort.includes('赛季') ||
        queryLowerForSort.includes('技改') ||
        queryLowerForSort.includes('改动');
      const isRaidQueryForSort =
        queryLowerForSort.includes('副本') ||
        queryLowerForSort.includes('raid') ||
        queryLowerForSort.includes('弓月城') ||
        queryLowerForSort.includes('一之窟') ||
        queryLowerForSort.includes('太极宫') ||
        queryLowerForSort.includes('空城殿');

      const normalized = parsedResults
        .map((result): SearchResult | null => {
          if (!result.url) {
            // 仅在开发环境记录跳过的结果
            if (process.env.NODE_ENV === 'development') {
              this.logger.debug(`跳过无 URL 的结果：${JSON.stringify(result)}`);
            }
            return null;
          }
          const normalizedUrl = this.normalizeUrl(result.url);
          const title = (result.title ?? normalizedUrl).trim();
          const snippet = (result.snippet ?? '').slice(0, 600).trim();
          const inScope = this.keepCangyun(normalizedUrl);

          // 仅在开发环境记录被过滤的 URL
          if (!inScope && process.env.NODE_ENV === 'development') {
            this.logger.debug(`URL 不在允许的攻略站范围内：${normalizedUrl}`);
          }

          this.metadataByUrl.set(normalizedUrl, {
            title,
            snippet,
          });

          // 计算优先级分数
          const lowerTitle = title.toLowerCase();
          let priorityScore = 0;
          if (isSeasonQueryForSort && lowerTitle.includes('山海源流')) {
            priorityScore += 100;
          }
          if (isRaidQueryForSort) {
            if (
              lowerTitle.includes('弓月城') ||
              lowerTitle.includes('会战弓月城') ||
              lowerTitle.includes('普通弓月城') ||
              lowerTitle.includes('英雄弓月城') ||
              lowerTitle.includes('pt弓月城') ||
              lowerTitle.includes('yx弓月城')
            ) {
              priorityScore += 100;
            }
          }
          // 对所有查询都优先山海源流
          if (lowerTitle.includes('山海源流')) {
            priorityScore += 50;
          }

          return {
            title,
            url: normalizedUrl,
            snippet,
            notExactPath: !inScope,
            priorityScore,
          };
        })
        .filter((item): item is SearchResult => item !== null)
        // 按优先级排序
        .sort((a, b) => {
          const scoreA = a.priorityScore ?? 0;
          const scoreB = b.priorityScore ?? 0;
          return scoreB - scoreA;
        });

      // 记录过滤结果（帮助诊断问题）
      const exactMatchCount = normalized.filter(
        (item) => !item.notExactPath,
      ).length;
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(
          `过滤后剩余 ${normalized.length} 条，其中精确匹配 ${exactMatchCount} 条`,
        );
      } else if (normalized.length === 0 && parsedResults.length > 0) {
        // 非开发环境：如果解析有结果但过滤后无结果，记录警告
        this.logger.warn(
          `Perplexity 搜索 "${trimmedQuery}" 解析到 ${parsedResults.length} 条结果，但过滤后全部被排除`,
        );
      }

      const exactMatches = normalized.filter((item) => !item.notExactPath);

      let resultPayload: SearchToolResult;
      if (exactMatches.length > 0) {
        resultPayload = { results: exactMatches.slice(0, limit) };
      } else if (normalized.length > 0) {
        // 如果没有精确匹配，返回其他攻略站的结果
        resultPayload = {
          results: normalized.slice(0, limit),
          note: '已返回其他攻略站的结果',
        };
      } else {
        // 完全无结果
        this.logger.warn(
          `Perplexity 搜索 "${trimmedQuery}" 未返回任何结果（解析到 ${parsedResults.length} 条，过滤后 ${normalized.length} 条）`,
        );
        return { results: [], note: '未找到相关内容' };
      }

      this.setCache(
        this.searchCache,
        cacheKey,
        resultPayload,
        SEARCH_CACHE_TTL_MS,
      );
      return resultPayload;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorMsgLower = errorMessage.toLowerCase();

      // 识别常见错误类型
      let note = '搜索异常';
      if (
        errorMsgLower.includes('timeout') ||
        errorMsgLower.includes('abort')
      ) {
        note = '搜索超时，请稍后重试';
      } else if (
        errorMsgLower.includes('api key') ||
        errorMsgLower.includes('unauthorized') ||
        errorMsgLower.includes('401')
      ) {
        note = 'Perplexity API Key 无效或未配置';
        this.logger.error('Perplexity API Key 配置错误');
      } else if (
        errorMsgLower.includes('model') ||
        errorMsgLower.includes('not found') ||
        errorMsgLower.includes('404')
      ) {
        note = 'Perplexity 模型不可用，请检查配置';
        this.logger.error('Perplexity 模型配置错误');
      } else if (
        errorMsgLower.includes('rate limit') ||
        errorMsgLower.includes('429')
      ) {
        note = '搜索请求过于频繁，请稍后重试';
      } else if (
        errorMsgLower.includes('network') ||
        errorMsgLower.includes('fetch')
      ) {
        note = '网络连接失败，请检查网络';
      }

      this.logger.warn(
        `Perplexity 搜索异常：${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      // 返回错误信息，但不抛出异常，确保不影响知识库搜索
      return {
        results: [],
        note: `外部搜索失败：${note}。请使用知识库中的资料回答问题。`,
      };
    }
  }

  createTools(options: CreateToolsOptions = {}): {
    searchTool: Tool;
    fetchPageTool: Tool;
  } {
    const registerSource = options.registerSource ?? (() => undefined);

    const searchParams = z.object({
      query: z.string().describe('搜索关键词（建议使用中文问题描述）'),
      maxResults: z.number().int().min(1).max(10).optional().default(6),
    });

    const searchTool = tool<z.infer<typeof searchParams>, SearchToolResult>({
      name: 'cangyun_search',
      description:
        '在多个攻略站搜索攻略（语雀苍云空间、剑三魔盒、每日攻略），返回标题、链接与简要片段。搜索时优先返回"山海源流"赛季的攻略或技改。对于副本相关问题，优先搜索"会战弓月城"、"普通弓月城"、"英雄弓月城"、"pt弓月城"、"yx弓月城"相关内容。注意：这是补充搜索，如果返回空结果，请使用知识库中的资料回答问题。',
      inputSchema: searchParams,
      execute: async ({ query, maxResults }) => {
        const trimmedQuery = query.trim();
        if (trimmedQuery.length === 0) {
          return { results: [] };
        }

        const limit = maxResults ?? 6;
        const cacheKey = `${trimmedQuery}::${limit}`;
        const cached = this.getFromCache(this.searchCache, cacheKey);
        if (cached) {
          cached.results.forEach((result) => {
            if (!result.notExactPath) {
              registerSource({
                title: result.title,
                url: result.url,
              });
            }
          });
          return cached;
        }

        if (!this.perplexityApiKey) {
          return { results: [], note: '搜索未配置（PERPLEXITY_API_KEY 缺失）' };
        }

        try {
          const controller = new AbortController();
          // 构造 Perplexity 查询，要求返回 JSON 格式的结构化结果
          // 检测查询类型，增强搜索提示
          const queryLower = trimmedQuery.toLowerCase();
          const isSeasonQueryType =
            queryLower.includes('赛季') ||
            queryLower.includes('技改') ||
            queryLower.includes('改动');
          const isRaidQueryType =
            queryLower.includes('副本') ||
            queryLower.includes('raid') ||
            queryLower.includes('弓月城') ||
            queryLower.includes('一之窟') ||
            queryLower.includes('太极宫') ||
            queryLower.includes('空城殿');

          let priorityHint = '';
          if (isSeasonQueryType && !queryLower.includes('山海源流')) {
            priorityHint =
              '\n\n重要：当前赛季是"山海源流"赛季，请优先返回标题包含"山海源流"的文档。';
          }
          if (isRaidQueryType && !queryLower.includes('弓月城')) {
            priorityHint +=
              '\n\n重要：请优先返回标题包含"弓月城"、"会战弓月城"、"普通弓月城"、"英雄弓月城"的文档。';
          }

          const searchPrompt = `请搜索以下问题，查找来自以下攻略站的文档：
- 语雀苍云空间：https://www.yuque.com/sgyxy/cangyun
- 剑三魔盒：https://www.jx3box.com
- 每日攻略：https://daily.xoyo.com
- 其他 xoyo.com 子域名（如 kefu.xoyo.com 等）

要求：
1. 返回最多 ${limit} 条相关结果${priorityHint}
2. 每条结果必须包含：title（文档标题）、url（完整链接，必须来自上述网站）、snippet（简要片段，100字以内）
3. 仅返回 JSON 数组格式，不要任何其他文字说明、markdown 代码块标记或解释
4. 如果找不到相关内容，返回空数组 []

搜索问题：${trimmedQuery}

请直接返回 JSON 数组，格式示例：
[{"title": "文档标题", "url": "https://www.yuque.com/sgyxy/cangyun/xxx", "snippet": "简要内容..."}]`;

          // 移除频繁的搜索请求日志

          const response = await withTimeout(
            fetch('https://api.perplexity.ai/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.perplexityApiKey}`,
              },
              body: JSON.stringify({
                model: 'sonar',
                messages: [
                  {
                    role: 'system',
                    content:
                      '你是一个专业的搜索助手，擅长从多个攻略站（语雀苍云空间、剑三魔盒、每日攻略）查找攻略文档。请严格按照要求返回 JSON 格式的结果。',
                  },
                  {
                    role: 'user',
                    content: searchPrompt,
                  },
                ],
                temperature: 0.2,
                max_tokens: 2000,
              }),
              signal: controller.signal,
            }),
            PERPLEXITY_SEARCH_TIMEOUT_MS, // Perplexity 搜索需要更长时间
            controller,
          );

          if (!response.ok) {
            const text = await response.text().catch(() => '');
            this.logger.warn(
              `Perplexity 搜索失败（${response.status}）：${text || '无响应正文'}`,
            );
            return { results: [], note: `搜索失败(${response.status})` };
          }

          const raw = (await response.json()) as PerplexitySearchResponse;
          const content = raw.choices?.[0]?.message?.content?.trim() ?? '';

          if (!content) {
            this.logger.warn('Perplexity 返回空内容');
            return { results: [], note: '未找到相关内容' };
          }

          // 记录原始返回内容用于调试
          this.logger.debug(
            `Perplexity 原始返回内容（前500字符）：${content.slice(0, 500)}`,
          );

          // 尝试从返回内容中提取 JSON
          let parsedResults: PerplexitySearchItem[] = [];
          try {
            // 先尝试移除 markdown 代码块标记
            let cleanedContent = content.trim();
            if (cleanedContent.startsWith('```')) {
              // 移除开头的 ```json 或 ```
              cleanedContent = cleanedContent.replace(/^```(?:json)?\s*/i, '');
              // 移除结尾的 ```
              cleanedContent = cleanedContent.replace(/\s*```\s*$/, '');
            }

            // 尝试提取 JSON 数组（匹配最外层的中括号）
            const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              parsedResults = JSON.parse(
                jsonMatch[0],
              ) as PerplexitySearchItem[];
            } else {
              // 如果没有找到数组，尝试直接解析整个内容
              parsedResults = JSON.parse(
                cleanedContent,
              ) as PerplexitySearchItem[];
            }
          } catch {
            this.logger.warn(
              `Perplexity 返回内容无法解析为 JSON: ${content.slice(0, 300)}`,
            );
            // 尝试从文本中提取链接（支持多个攻略站）
            const urlPatterns = [
              // 语雀苍云空间
              /https?:\/\/[^/]*yuque\.com\/sgyxy\/cangyun\/[^\s)"']+/g,
              /https?:\/\/www\.yuque\.com\/sgyxy\/cangyun\/[^\s)"']+/g,
              // 剑三魔盒
              /https?:\/\/[^/]*jx3box\.com\/[^\s)"']+/g,
              /https?:\/\/www\.jx3box\.com\/[^\s)"']+/g,
              // 每日攻略和其他 xoyo.com 子域名
              /https?:\/\/daily\.xoyo\.com\/[^\s)"']+/g,
              /https?:\/\/[^/]*\.xoyo\.com\/[^\s)"']+/g,
              /https?:\/\/xoyo\.com\/[^\s)"']+/g,
            ];
            const extractedUrls: string[] = [];
            for (const pattern of urlPatterns) {
              const matches = content.matchAll(pattern);
              for (const match of matches) {
                if (match[0] && !extractedUrls.includes(match[0])) {
                  extractedUrls.push(match[0]);
                }
              }
            }
            if (extractedUrls.length > 0) {
              parsedResults = extractedUrls.map((url) => ({
                title:
                  url
                    .split('/')
                    .pop()
                    ?.replace(/[?#].*$/, '') ?? url,
                url,
                snippet: '',
              }));
              if (process.env.NODE_ENV === 'development') {
                this.logger.debug(
                  `从文本中提取到 ${extractedUrls.length} 个链接`,
                );
              }
            }
          }

          // 仅在开发环境记录结果统计
          if (
            process.env.NODE_ENV === 'development' &&
            parsedResults.length > 0
          ) {
            this.logger.debug(
              `Perplexity 返回 ${parsedResults.length} 条原始结果`,
            );
          }

          // 检测查询类型，用于优先级排序
          const queryLowerForSort = trimmedQuery.toLowerCase();
          const isSeasonQueryForSort =
            queryLowerForSort.includes('赛季') ||
            queryLowerForSort.includes('技改') ||
            queryLowerForSort.includes('改动');
          const isRaidQueryForSort =
            queryLowerForSort.includes('副本') ||
            queryLowerForSort.includes('raid') ||
            queryLowerForSort.includes('弓月城') ||
            queryLowerForSort.includes('一之窟') ||
            queryLowerForSort.includes('太极宫') ||
            queryLowerForSort.includes('空城殿');

          const normalized = parsedResults
            .map((result): SearchResult | null => {
              if (!result.url) {
                if (process.env.NODE_ENV === 'development') {
                  this.logger.debug(
                    `跳过无 URL 的结果：${JSON.stringify(result)}`,
                  );
                }
                return null;
              }
              const normalizedUrl = this.normalizeUrl(result.url);
              const title = (result.title ?? normalizedUrl).trim();
              const snippet = (result.snippet ?? '').slice(0, 600).trim();
              const inScope = this.keepCangyun(normalizedUrl);

              if (!inScope) {
                if (process.env.NODE_ENV === 'development') {
                  this.logger.debug(
                    `URL 不在允许的攻略站范围内：${normalizedUrl}`,
                  );
                }
              }

              this.metadataByUrl.set(normalizedUrl, {
                title,
                snippet,
              });

              // 计算优先级分数
              const lowerTitle = title.toLowerCase();
              let priorityScore = 0;
              if (isSeasonQueryForSort && lowerTitle.includes('山海源流')) {
                priorityScore += 100;
              }
              if (isRaidQueryForSort) {
                if (
                  lowerTitle.includes('弓月城') ||
                  lowerTitle.includes('会战弓月城') ||
                  lowerTitle.includes('普通弓月城') ||
                  lowerTitle.includes('英雄弓月城') ||
                  lowerTitle.includes('pt弓月城') ||
                  lowerTitle.includes('yx弓月城')
                ) {
                  priorityScore += 100;
                }
              }
              // 对所有查询都优先山海源流
              if (lowerTitle.includes('山海源流')) {
                priorityScore += 50;
              }

              return {
                title,
                url: normalizedUrl,
                snippet,
                notExactPath: !inScope,
                priorityScore,
              };
            })
            .filter((item): item is SearchResult => item !== null)
            // 按优先级排序
            .sort((a, b) => {
              const scoreA = a.priorityScore ?? 0;
              const scoreB = b.priorityScore ?? 0;
              return scoreB - scoreA;
            });

          // 仅在开发环境记录过滤结果
          if (process.env.NODE_ENV === 'development') {
            this.logger.debug(
              `过滤后剩余 ${normalized.length} 条，其中精确匹配 ${normalized.filter((item) => !item.notExactPath).length} 条`,
            );
          }

          const exactMatches = normalized.filter((item) => !item.notExactPath);

          let resultPayload: SearchToolResult;
          if (exactMatches.length > 0) {
            exactMatches.forEach((item) =>
              registerSource({ title: item.title, url: item.url }),
            );
            resultPayload = { results: exactMatches.slice(0, limit) };
          } else if (normalized.length > 0) {
            // 如果没有精确匹配，返回其他攻略站的结果
            normalized.forEach((item) =>
              registerSource({ title: item.title, url: item.url }),
            );
            resultPayload = {
              results: normalized.slice(0, limit),
              note: '已返回其他攻略站的结果',
            };
          } else {
            // 完全无结果
            this.logger.warn(
              `Perplexity 搜索 "${trimmedQuery}" 未返回任何结果`,
            );
            return { results: [], note: '未找到相关内容' };
          }

          this.setCache(
            this.searchCache,
            cacheKey,
            resultPayload,
            SEARCH_CACHE_TTL_MS,
          );
          return resultPayload;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorMsgLower = errorMessage.toLowerCase();

          // 识别常见错误类型
          let note = '搜索异常';
          if (
            errorMsgLower.includes('timeout') ||
            errorMsgLower.includes('abort')
          ) {
            note = '搜索超时，请稍后重试';
          } else if (
            errorMsgLower.includes('api key') ||
            errorMsgLower.includes('unauthorized') ||
            errorMsgLower.includes('401')
          ) {
            note = 'Perplexity API Key 无效或未配置';
            this.logger.error('Perplexity API Key 配置错误');
          } else if (
            errorMsgLower.includes('model') ||
            errorMsgLower.includes('not found') ||
            errorMsgLower.includes('404')
          ) {
            note = 'Perplexity 模型不可用，请检查配置';
            this.logger.error('Perplexity 模型配置错误');
          } else if (
            errorMsgLower.includes('rate limit') ||
            errorMsgLower.includes('429')
          ) {
            note = '搜索请求过于频繁，请稍后重试';
          } else if (
            errorMsgLower.includes('network') ||
            errorMsgLower.includes('fetch')
          ) {
            note = '网络连接失败，请检查网络';
          }

          this.logger.warn(
            `Perplexity 搜索异常：${errorMessage}`,
            error instanceof Error ? error.stack : undefined,
          );
          // 返回错误信息，但不抛出异常，确保不影响知识库搜索
          return {
            results: [],
            note: `外部搜索失败：${note}。请使用知识库中的资料回答问题。`,
          };
        }
      },
    });

    const fetchParams = z.object({
      url: z.string().url(),
      maxChars: z
        .number()
        .int()
        .min(500)
        .max(120_000)
        .optional()
        .default(DEFAULT_MAX_CHARS),
      clean: z.boolean().optional().default(true),
    });

    const fetchPageTool = tool<z.infer<typeof fetchParams>, FetchPageResult>({
      name: 'cangyun_fetch_page',
      description:
        '抓取攻略站页面正文文本（支持语雀苍云空间、剑三魔盒、每日攻略），用于深入理解攻略细节。请仅对少量高价值链接调用。',
      inputSchema: fetchParams,
      execute: async ({ url, maxChars, clean }) => {
        const normalizedUrl = this.normalizeUrl(url);
        if (!this.keepCangyun(normalizedUrl)) {
          return { url: normalizedUrl, text: '' };
        }

        const cacheKey = `${normalizedUrl}::${clean ? 'clean' : 'raw'}::${maxChars ?? DEFAULT_MAX_CHARS}`;
        const cached = this.getFromCache(this.pageCache, cacheKey);
        if (cached) {
          registerSource({
            title:
              this.metadataByUrl.get(normalizedUrl)?.title ?? normalizedUrl,
            url: normalizedUrl,
          });
          return cached;
        }

        try {
          const controller = new AbortController();
          const response = await withTimeout(
            fetch(normalizedUrl, {
              method: 'GET',
              headers: {
                Accept: 'text/html,application/xhtml+xml',
              },
              signal: controller.signal,
            }),
            DEFAULT_TIMEOUT_MS,
            controller,
          );

          if (!response.ok) {
            await response.text().catch(() => '');
            const status = response.status;
            let errorNote = '';
            if (status === 404) {
              errorNote = '页面不存在';
            } else if (status === 403) {
              errorNote = '页面访问受限';
            } else if (status === 429) {
              errorNote = '请求过于频繁';
            } else if (status >= 500) {
              errorNote = '服务器错误';
            } else {
              errorNote = `HTTP ${status}`;
            }
            this.logger.warn(
              `抓取攻略站页面失败（${status} ${errorNote}）：${normalizedUrl}`,
            );
            return { url: normalizedUrl, text: '' };
          }

          const html = await response.text();
          const text = await this.extractText(
            html,
            normalizedUrl,
            clean ?? true,
          );
          const payload: FetchPageResult = {
            url: normalizedUrl,
            text: text.slice(0, maxChars ?? DEFAULT_MAX_CHARS),
          };

          registerSource({
            title:
              this.metadataByUrl.get(normalizedUrl)?.title ?? normalizedUrl,
            url: normalizedUrl,
          });

          this.setCache(this.pageCache, cacheKey, payload, PAGE_CACHE_TTL_MS);
          return payload;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorMsgLower = errorMessage.toLowerCase();

          let errorNote = '抓取异常';
          if (
            errorMsgLower.includes('timeout') ||
            errorMsgLower.includes('abort')
          ) {
            errorNote = '抓取超时';
          } else if (
            errorMsgLower.includes('network') ||
            errorMsgLower.includes('fetch')
          ) {
            errorNote = '网络连接失败';
          }

          this.logger.warn(
            `抓取攻略站页面异常（${errorNote}）：${errorMessage}`,
            error instanceof Error ? error.stack : undefined,
          );
          return { url: normalizedUrl, text: '' };
        }
      },
    });

    return {
      searchTool,
      fetchPageTool,
    };
  }

  private getFromCache<T>(
    store: Map<string, CachedValue<T>>,
    key: string,
  ): T | undefined {
    const cached = store.get(key);
    if (!cached) {
      return undefined;
    }
    if (cached.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return cached.value;
  }

  private setCache<T>(
    store: Map<string, CachedValue<T>>,
    key: string,
    value: T,
    ttlMs: number,
  ) {
    store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  private keepCangyun(url: string): boolean {
    try {
      const target = new URL(url);
      const normalizedHref = target.href.replace('http://', 'https://');
      const hostname = target.hostname.toLowerCase();

      // 检查是否属于允许的攻略站域名
      const isAllowedDomain = ALLOWED_DOMAINS.some((domain) =>
        hostname.endsWith(domain),
      );

      if (!isAllowedDomain) {
        return false;
      }

      // 对于语雀，需要确保是苍云空间
      if (hostname.includes('yuque.com')) {
        return (
          normalizedHref.includes('/sgyxy/cangyun') ||
          normalizedHref.startsWith(ALLOWED_PATH_PREFIXES[0])
        );
      }

      // 对于其他攻略站，只要域名匹配即可
      return true;
    } catch (error) {
      // 仅在开发环境记录 URL 解析失败
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(
          `URL 解析失败，视为非攻略站：${url}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
      return false;
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.protocol = 'https:';
      return parsed.toString();
    } catch {
      // 如果 URL 解析失败，尝试使用第一个允许的前缀作为基础 URL
      const normalized = new URL(url, ALLOWED_PATH_PREFIXES[0]);
      normalized.protocol = 'https:';
      return normalized.toString();
    }
  }

  private async extractText(
    html: string,
    url: string,
    clean: boolean,
  ): Promise<string> {
    if (!clean) {
      return stripHtml(html);
    }

    try {
      const { JSDOM } = (await import('jsdom')) as typeof import('jsdom');
      const { Readability } = (await import(
        '@mozilla/readability'
      )) as typeof import('@mozilla/readability');

      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      const textContent = article?.textContent?.trim();
      if (textContent && textContent.length > 0) {
        return textContent.replace(/\s+\n/g, '\n').trim();
      }
      return stripHtml(html);
    } catch (error) {
      // 仅在开发环境记录 Readability 提取失败
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(
          `Readability 提取失败，回退至基础清洗：${(error as Error).message}`,
        );
      }
      return stripHtml(html);
    }
  }
}
