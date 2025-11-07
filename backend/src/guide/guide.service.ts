import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AppConfig,
  GuideConfig,
  IntegrationsConfig,
} from '../config/index.js';

export interface CurrentSeasonGuide {
  seasonId: string;
  seasonName: string;
  seasonStartsAt?: string;
  seasonEndsAt?: string;
  whitepaperUrl?: string;
  whitepaperSummary?: string;
}

export interface GuideSearchResult {
  title: string;
  url: string;
  excerpt?: string;
}

@Injectable()
export class GuideService {
  private readonly logger = new Logger(GuideService.name);
  private readonly baseUrl?: string;
  private readonly whitepaperKeywords: string[];
  private readonly perplexityApiKey?: string;
  private readonly DEFAULT_TIMEOUT_MS = 6000;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const config = this.configService.get<GuideConfig>('guides');
    this.baseUrl = config?.baseUrl?.trim();
    this.whitepaperKeywords =
      config?.whitepaperKeywords && config.whitepaperKeywords.length > 0
        ? config.whitepaperKeywords
        : ['白皮书'];

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
        const trimmed = apiKey.trim();
        this.perplexityApiKey = trimmed.length > 0 ? trimmed : undefined;
      }
    }
  }

  async searchGuides(query: string, topK = 5): Promise<GuideSearchResult[]> {
    if (!this.baseUrl) {
      return [];
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return [];
    }

    // 使用 Perplexity 搜索攻略站内容
    if (this.perplexityApiKey) {
      return this.searchGuidesViaPerplexity(trimmedQuery, topK);
    }

    this.logger.warn('PERPLEXITY_API_KEY 未配置，无法搜索攻略站内容');
    return [];
  }

  private async searchGuidesViaPerplexity(
    query: string,
    topK: number,
  ): Promise<GuideSearchResult[]> {
    if (!this.perplexityApiKey || !this.baseUrl) {
      return [];
    }

    try {
      const searchPrompt = `请搜索以下问题，仅返回来自 ${this.baseUrl} 的攻略文档链接。要求：
1. 返回最多 ${topK} 条结果
2. 每条结果包含：title（标题）、url（完整链接）、snippet（简要片段，100字以内）
3. 仅返回 JSON 数组格式，不要其他文字说明
4. 如果找不到相关内容，返回空数组 []

搜索问题：${query}

请以 JSON 数组格式返回结果，例如：
[{"title": "文档标题", "url": "${this.baseUrl}/xxx", "snippet": "简要内容..."}]`;

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.DEFAULT_TIMEOUT_MS,
      );

      const response = await fetch(
        'https://api.perplexity.ai/chat/completions',
        {
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
                  '你是一个专业的搜索助手，擅长从攻略站查找文档。请严格按照要求返回 JSON 格式的结果。',
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
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const status = response.status;
        let errorNote = '';
        if (status === 401 || status === 403) {
          errorNote = 'API Key 无效或未配置';
          this.logger.error('Perplexity API Key 配置错误');
        } else if (status === 404) {
          errorNote = '模型不存在';
          this.logger.error('Perplexity 模型配置错误');
        } else if (status === 429) {
          errorNote = '请求过于频繁';
        } else if (status >= 500) {
          errorNote = '服务器错误';
        } else {
          errorNote = `HTTP ${status}`;
        }
        this.logger.warn(
          `Perplexity 搜索失败（${status} ${errorNote}）：${text || '无响应正文'}`,
        );
        return [];
      }

      const raw = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };
      const content = raw.choices?.[0]?.message?.content?.trim() ?? '';

      if (!content) {
        return [];
      }

      // 尝试从返回内容中提取 JSON
      let parsedResults: Array<{
        title: string;
        url: string;
        snippet?: string;
      }> = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsedResults = JSON.parse(jsonMatch[0]) as typeof parsedResults;
        } else {
          parsedResults = JSON.parse(content) as typeof parsedResults;
        }
      } catch {
        // 尝试从文本中提取链接
        const urlMatches = content.matchAll(
          new RegExp(
            `${this.baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^\\s\\)]+`,
            'g',
          ),
        );
        const extractedUrls = Array.from(urlMatches).map((m) => m[0]);
        if (extractedUrls.length > 0) {
          parsedResults = extractedUrls.map((url) => ({
            title: url.split('/').pop() ?? url,
            url,
            snippet: '',
          }));
        }
      }

      return parsedResults
        .map((item) => ({
          title: item.title || item.url,
          url: item.url,
          excerpt: item.snippet,
        }))
        .slice(0, topK);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorMsgLower = errorMessage.toLowerCase();

      let errorNote = '搜索异常';
      if (
        errorMsgLower.includes('timeout') ||
        errorMsgLower.includes('abort')
      ) {
        errorNote = '搜索超时';
      } else if (
        errorMsgLower.includes('api key') ||
        errorMsgLower.includes('unauthorized')
      ) {
        errorNote = 'API Key 配置错误';
        this.logger.error('Perplexity API Key 配置错误');
      } else if (
        errorMsgLower.includes('model') ||
        errorMsgLower.includes('not found')
      ) {
        errorNote = '模型配置错误';
        this.logger.error('Perplexity 模型配置错误');
      } else if (
        errorMsgLower.includes('rate limit') ||
        errorMsgLower.includes('429')
      ) {
        errorNote = '请求过于频繁';
      } else if (
        errorMsgLower.includes('network') ||
        errorMsgLower.includes('fetch')
      ) {
        errorNote = '网络连接失败';
      }

      this.logger.warn(
        `Perplexity 搜索异常（${errorNote}）：${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return [];
    }
  }

  private async searchGuidesViaApi(
    query: string,
    topK: number,
  ): Promise<GuideSearchResult[]> {
    if (!this.baseUrl) {
      return [];
    }

    const candidates: string[] = [
      '/api/search',
      '/api/guides/search',
      '/api/posts/search',
    ];

    for (const path of candidates) {
      try {
        const url = new URL(path, this.baseUrl);
        url.searchParams.set('q', query);
        url.searchParams.set('limit', String(topK));
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          if (response.status !== 404) {
            // 仅在开发环境记录 API 响应状态
            if (process.env.NODE_ENV === 'development') {
              this.logger.debug(
                `Search API ${url} returned ${response.status}`,
              );
            }
          }
          continue;
        }

        const data = (await response.json().catch(() => null)) as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null;
        if (!data) {
          continue;
        }

        const items = Array.isArray(data)
          ? data
          : ((data.items as Record<string, unknown>[] | undefined) ?? []);

        const results: GuideSearchResult[] = items
          .map((item) => {
            const title = (item.title as string | undefined)?.trim();
            const url = (item.url as string | undefined)?.trim();
            const excerpt = (item.excerpt as string | undefined)?.trim();
            if (!title || !url) return undefined;
            return {
              title,
              url: new URL(url, this.baseUrl).toString(),
              excerpt,
            } as GuideSearchResult;
          })
          .filter((v): v is GuideSearchResult => Boolean(v))
          .slice(0, topK);

        if (results.length > 0) {
          return results;
        }
      } catch (error) {
        // 仅在开发环境记录详细日志
        if (process.env.NODE_ENV === 'development') {
          this.logger.debug(
            `Search API failed at ${path}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return [];
  }

  private async scrapeSearchResults(
    query: string,
    topK: number,
  ): Promise<GuideSearchResult[]> {
    if (!this.baseUrl) {
      return [];
    }

    let browser: import('playwright').Browser | null = null;
    try {
      const playwright = await import('playwright').catch(() => null);
      if (!playwright) {
        return [];
      }

      browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();

      // 常见搜索路径尝试
      const searchPaths = ['/search', '/s', '/find'];
      let found = false;
      for (const path of searchPaths) {
        const url = new URL(path, this.baseUrl);
        url.searchParams.set('q', query);
        try {
          await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
          found = true;
          break;
        } catch {
          // 继续尝试下一个路径
        }
      }
      if (!found) {
        // 直接到首页，尝试站内搜索框
        await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' });
        // 最简降级：抓取首页所有链接，做 query 关键词匹配
      }

      const results = await page.evaluate<
        Array<{ title: string; url: string }> | null,
        { query: string; limit?: number }
      >(
        ({ query: q, limit }) => {
          const max =
            Number.isFinite(limit) && typeof limit === 'number' ? limit : 5;
          const anchors = Array.from(document.querySelectorAll('a'));

          const items = anchors
            .map((a) => {
              const href = a.href || a.getAttribute('href') || '';
              const title = (
                a.textContent ||
                a.getAttribute('title') ||
                ''
              ).trim();
              if (!href || !title) return null;
              const textLower =
                `${title} ${(a.getAttribute('aria-label') || '').trim()}`.toLowerCase();
              const qLower = q.toLowerCase();
              if (!textLower.includes(qLower)) return null;
              return { title, url: href };
            })
            .filter((v): v is { title: string; url: string } => Boolean(v))
            .slice(0, max);

          return items;
        },
        { query, limit: topK },
      );

      if (!this.baseUrl) {
        return [];
      }
      const normalized = (results ?? []).map((r) => ({
        title: r.title,
        url: new URL(r.url, this.baseUrl).toString(),
      }));

      return normalized.slice(0, topK);
    } catch (error) {
      this.logger.warn(
        `Failed to scrape search results: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    } finally {
      try {
        await browser?.close();
      } catch {
        // ignore closing errors
      }
    }
  }

  isEnabled(): boolean {
    return Boolean(this.baseUrl);
  }

  async getCurrentSeasonGuide(): Promise<CurrentSeasonGuide | null> {
    if (!this.baseUrl) {
      return null;
    }

    try {
      const seasonInfo = await this.fetchCurrentSeason();
      if (!seasonInfo) {
        return null;
      }

      const {
        seasonId,
        seasonName,
        seasonStartsAt,
        seasonEndsAt,
        whitepaperUrl,
      } = seasonInfo;

      if (!whitepaperUrl) {
        return {
          seasonId,
          seasonName,
          seasonStartsAt,
          seasonEndsAt,
        };
      }

      const summary = await this.fetchWhitepaperSummary(whitepaperUrl);

      return {
        seasonId,
        seasonName,
        seasonStartsAt,
        seasonEndsAt,
        whitepaperUrl,
        whitepaperSummary: summary,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch current season guide: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async fetchCurrentSeason(): Promise<{
    seasonId: string;
    seasonName: string;
    seasonStartsAt?: string;
    seasonEndsAt?: string;
    whitepaperUrl?: string;
  } | null> {
    if (!this.baseUrl) {
      return null;
    }

    // 使用 Perplexity 搜索当前赛季白皮书
    if (this.perplexityApiKey) {
      return this.fetchCurrentSeasonViaPerplexity();
    }

    this.logger.warn('PERPLEXITY_API_KEY 未配置，无法获取当前赛季白皮书');
    return null;
  }

  private async fetchCurrentSeasonViaPerplexity(): Promise<{
    seasonId: string;
    seasonName: string;
    seasonStartsAt?: string;
    seasonEndsAt?: string;
    whitepaperUrl?: string;
  } | null> {
    if (!this.perplexityApiKey || !this.baseUrl) {
      return null;
    }

    try {
      const keywordQuery = this.whitepaperKeywords.join(' ');
      const searchPrompt = `请搜索当前最新的赛季白皮书，仅返回来自 ${this.baseUrl} 的链接。要求：
1. 返回最新的一篇白皮书文档
2. 结果包含：title（标题）、url（完整链接）
3. 仅返回 JSON 对象格式，不要其他文字说明
4. 如果找不到相关内容，返回 null

搜索关键词：${keywordQuery} 最新 当前赛季

请以 JSON 对象格式返回结果，例如：
{"title": "山海源流 | 分山劲白皮书", "url": "${this.baseUrl}/whitepaper-21"}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.DEFAULT_TIMEOUT_MS,
      );

      const response = await fetch(
        'https://api.perplexity.ai/chat/completions',
        {
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
                  '你是一个专业的搜索助手，擅长从攻略站查找最新赛季白皮书。请严格按照要求返回 JSON 格式的结果。',
              },
              {
                role: 'user',
                content: searchPrompt,
              },
            ],
            temperature: 0.2,
            max_tokens: 1000,
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const status = response.status;
        let errorNote = '';
        if (status === 401 || status === 403) {
          errorNote = 'API Key 无效或未配置';
          this.logger.error('Perplexity API Key 配置错误');
        } else if (status === 404) {
          errorNote = '模型不存在';
          this.logger.error('Perplexity 模型配置错误');
        } else if (status === 429) {
          errorNote = '请求过于频繁';
        } else if (status >= 500) {
          errorNote = '服务器错误';
        } else {
          errorNote = `HTTP ${status}`;
        }
        this.logger.warn(
          `Perplexity 搜索当前赛季失败（${status} ${errorNote}）：${text || '无响应正文'}`,
        );
        return null;
      }

      const raw = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };
      const content = raw.choices?.[0]?.message?.content?.trim() ?? '';

      if (!content) {
        return null;
      }

      // 尝试从返回内容中提取 JSON
      let parsedResult: { title?: string; url?: string } | null = null;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[0]) as typeof parsedResult;
        } else {
          parsedResult = JSON.parse(content) as typeof parsedResult;
        }
      } catch {
        // 尝试从文本中提取链接
        const urlMatch = content.match(
          new RegExp(
            `${this.baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^\\s\\)]+`,
            'i',
          ),
        );
        if (urlMatch) {
          const url = urlMatch[0];
          parsedResult = {
            title: url.split('/').pop() ?? '白皮书',
            url,
          };
        }
      }

      if (!parsedResult || !parsedResult.url) {
        return null;
      }

      const whitepaperUrl = new URL(parsedResult.url, this.baseUrl).toString();
      const title =
        parsedResult.title || whitepaperUrl.split('/').pop() || '白皮书';
      const nameCleaned = this.stripKeywords(title, this.whitepaperKeywords);
      const idFromDigits = whitepaperUrl.match(/(\d{2,})/)?.[1];
      const idFromSeason = whitepaperUrl.match(/season(?:s)?\/([^/?#]+)/i)?.[1];
      const seasonId = idFromDigits ?? idFromSeason ?? (nameCleaned || title);

      return {
        seasonId,
        seasonName: nameCleaned || title,
        whitepaperUrl,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorMsgLower = errorMessage.toLowerCase();

      let errorNote = '搜索异常';
      if (
        errorMsgLower.includes('timeout') ||
        errorMsgLower.includes('abort')
      ) {
        errorNote = '搜索超时';
      } else if (
        errorMsgLower.includes('api key') ||
        errorMsgLower.includes('unauthorized')
      ) {
        errorNote = 'API Key 配置错误';
        this.logger.error('Perplexity API Key 配置错误');
      } else if (
        errorMsgLower.includes('model') ||
        errorMsgLower.includes('not found')
      ) {
        errorNote = '模型配置错误';
        this.logger.error('Perplexity 模型配置错误');
      } else if (
        errorMsgLower.includes('rate limit') ||
        errorMsgLower.includes('429')
      ) {
        errorNote = '请求过于频繁';
      } else if (
        errorMsgLower.includes('network') ||
        errorMsgLower.includes('fetch')
      ) {
        errorNote = '网络连接失败';
      }

      this.logger.warn(
        `Perplexity 搜索当前赛季异常（${errorNote}）：${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  private async fetchCurrentSeasonViaApi(): Promise<{
    seasonId: string;
    seasonName: string;
    seasonStartsAt?: string;
    seasonEndsAt?: string;
    whitepaperUrl?: string;
  } | null> {
    if (!this.baseUrl) {
      return null;
    }

    try {
      const currentSeasonUrl = new URL('/api/seasons/current', this.baseUrl);
      const response = await fetch(currentSeasonUrl, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status !== 404) {
          this.logger.warn(
            `Guide API returned ${response.status} for ${currentSeasonUrl}`,
          );
        } else {
          // 仅在开发环境记录详细日志
          if (process.env.NODE_ENV === 'development') {
            this.logger.debug(
              `Guide API returned 404 for ${currentSeasonUrl}, falling back to scraping.`,
            );
          }
        }
        return null;
      }

      const payload = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!payload) {
        this.logger.warn('Guide API did not return valid JSON payload.');
        return null;
      }

      const seasonId =
        (payload.season as string | undefined)?.trim() ??
        (payload.id as string | undefined)?.trim() ??
        (payload.code as string | undefined)?.trim();

      if (!seasonId) {
        this.logger.warn('Guide API payload missing season identifier.');
        return null;
      }

      const seasonName =
        (payload.name as string | undefined)?.trim() ??
        (payload.title as string | undefined)?.trim() ??
        seasonId;

      let whitepaperUrl =
        (payload.whitepaperUrl as string | undefined)?.trim() ??
        ((payload.whitepaper as Record<string, unknown> | undefined)?.url as
          | string
          | undefined);

      if (whitepaperUrl) {
        whitepaperUrl = new URL(whitepaperUrl, this.baseUrl).toString();
      } else {
        whitepaperUrl = new URL(
          `/api/seasons/${encodeURIComponent(seasonId)}/whitepaper`,
          this.baseUrl,
        ).toString();
      }

      return {
        seasonId,
        seasonName,
        seasonStartsAt: this.normalizeDateString(payload.startsAt),
        seasonEndsAt: this.normalizeDateString(payload.endsAt),
        whitepaperUrl,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve current season via API: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async scrapeCurrentSeason(): Promise<{
    seasonId: string;
    seasonName: string;
    whitepaperUrl?: string;
  } | null> {
    if (!this.baseUrl) {
      return null;
    }

    let browser: import('playwright').Browser | null = null;
    try {
      const playwright = await import('playwright').catch((error) => {
        this.logger.warn(
          `Playwright is not available for guide scraping: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      });

      if (!playwright) {
        return null;
      }

      browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' });

      const keywords = this.whitepaperKeywords;
      const result = await page.evaluate((kw) => {
        const normalizedKeywords = kw
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0);
        if (normalizedKeywords.length === 0) {
          return null;
        }

        const anchors = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('a'),
        );
        const candidates = anchors
          .map((anchor) => {
            const text =
              (
                anchor.textContent ??
                anchor.getAttribute('title') ??
                anchor.dataset.title ??
                ''
              )?.trim() ?? '';
            const textLower = text.toLowerCase();
            const matches = normalizedKeywords.some((keyword) =>
              textLower.includes(keyword),
            );
            if (!matches) {
              return null;
            }
            const href = anchor.href || anchor.getAttribute('href') || '';
            return {
              text,
              href,
            };
          })
          .filter((value): value is { text: string; href: string } => {
            if (!value) {
              return false;
            }
            return value.href.trim().length > 0;
          });

        if (candidates.length === 0) {
          return null;
        }

        // 返回全部候选，后端再按更新时间排序
        return candidates.map((c) => ({ text: c.text, href: c.href }));
      }, keywords);

      if (!result || !Array.isArray(result) || result.length === 0) {
        this.logger.warn(
          'Unable to locate whitepaper link on攻略站页面，请检查关键词或提供 API。',
        );
        return null;
      }

      if (!this.baseUrl) {
        return null;
      }
      const candidates = result.map((item) => {
        const itemTyped = item as { text: string; href: string };
        return {
          text: itemTyped.text,
          url: new URL(itemTyped.href, this.baseUrl).toString(),
        };
      });

      const scored: Array<{ text: string; url: string; updatedAt?: string }> =
        [];
      for (const c of candidates) {
        try {
          const resp = await fetch(c.url, {
            headers: { Accept: 'text/html,application/xhtml+xml' },
          });
          if (!resp.ok) continue;
          const html = await resp.text();
          const updatedIso = this.extractUpdatedAtIso(html);
          scored.push({ text: c.text, url: c.url, updatedAt: updatedIso });
        } catch {
          // ignore
        }
      }

      const pick = (entry: { text: string; url: string }) => {
        const nameCleaned = this.stripKeywords(
          entry.text,
          this.whitepaperKeywords,
        );
        const idFromDigits = entry.url.match(/(\d{2,})/)?.[1];
        const idFromSeason = entry.url.match(/season(?:s)?\/([^/?#]+)/i)?.[1];
        const seasonId =
          idFromDigits ?? idFromSeason ?? (nameCleaned || entry.text);
        return {
          seasonId,
          seasonName: nameCleaned || entry.text,
          whitepaperUrl: entry.url,
        };
      };

      if (scored.length === 0) {
        return pick(candidates[0]);
      }

      scored.sort((a, b) => {
        const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return tb - ta;
      });

      return pick(scored[0]);
    } catch (error) {
      this.logger.warn(
        `Failed to scrape guide site for current season: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    } finally {
      try {
        await browser?.close();
      } catch {
        // ignore closing errors
      }
    }
  }

  private async fetchWhitepaperSummary(
    url: string,
  ): Promise<string | undefined> {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json, text/plain, text/html',
        },
      });

      if (!response.ok) {
        this.logger.warn(
          `Whitepaper request returned ${response.status} for ${url}`,
        );
        return undefined;
      }

      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        const data = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (!data) {
          return undefined;
        }
        const summary =
          (data.summary as string | undefined)?.trim() ??
          (data.excerpt as string | undefined)?.trim();
        if (summary) {
          return this.truncate(summary);
        }
        const body =
          (data.content as string | undefined)?.trim() ??
          (data.body as string | undefined)?.trim();
        return body ? this.truncate(this.stripMarkup(body)) : undefined;
      }

      const text = await response.text();
      return this.truncate(this.stripMarkup(text));
    } catch (error) {
      this.logger.warn(
        `Failed to fetch whitepaper summary: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  private stripMarkup(value: string): string {
    return value
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private truncate(value: string, maxLength = 1500): string {
    if (value.length <= maxLength) {
      return value;
    }
    return value.slice(0, maxLength) + '...';
  }

  private normalizeDateString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return trimmed;
    }
    return date.toISOString();
  }

  private extractUpdatedAtIso(html: string): string | undefined {
    // 常见 meta 标记
    const metaMatch = html.match(
      /<meta[^>]+(?:property|name)=["'](?:article:modified_time|og:updated_time|updated|last-modified)["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    );
    if (metaMatch?.[1]) {
      const iso = new Date(metaMatch[1]).toISOString();
      if (!Number.isNaN(Date.parse(iso))) return iso;
    }
    // JSON 片段（Yuque 常见 updated_at）
    const jsonMatch = html.match(/"updated_at"\s*:\s*"([^"]+)"/i);
    if (jsonMatch?.[1]) {
      const iso = new Date(jsonMatch[1]).toISOString();
      if (!Number.isNaN(Date.parse(iso))) return iso;
    }
    // 可读日期（回退，匹配 2025-11-06 或 2025/11/06 这类）
    const dateMatch = html.match(
      /(\d{4}[/-]\d{1,2}[/-]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)/,
    );
    if (dateMatch?.[1]) {
      const iso = new Date(dateMatch[1]).toISOString();
      if (!Number.isNaN(Date.parse(iso))) return iso;
    }
    return undefined;
  }

  private stripKeywords(text: string, keywords: string[]): string {
    const normalized = keywords.map((k) => k.trim()).filter(Boolean);
    if (normalized.length === 0) return text;
    return normalized.reduce(
      (acc, k) =>
        acc
          .replace(
            new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
            '',
          )
          .trim(),
      text,
    );
  }
}
