#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { chromium, type Page } from 'playwright';
import TurndownService from 'turndown';

['.env.local', '.env']
  .map(file => path.resolve(process.cwd(), file))
  .forEach(envPath => {
    loadEnv({ path: envPath, override: false });
  });

const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../tmp/knowledge'
);

const DEFAULT_MAX_DOCS = Number.parseInt(
  process.env.YUQUE_MAX_DOCS ?? '50',
  10
);
const MAX_SCROLL_ATTEMPTS = Number.parseInt(
  process.env.YUQUE_SCROLL_ATTEMPTS ?? '12',
  10
);
const OCR_ENABLED = parseBoolean(process.env.YUQUE_OCR ?? 'true');
const OCR_LANG = process.env.YUQUE_OCR_LANG?.trim() || 'chi_sim+eng';

interface InlineSheet {
  title: string;
  dataset?: string | null;
  innerText?: string | null;
}

interface SheetPayload {
  url: string;
  body: string;
}

async function main() {
  const space = process.env.YUQUE_SPACE?.trim();
  const explicitUrls =
    process.env.YUQUE_DOC_URLS?.split(',')
      .map(url => url.trim())
      .filter(Boolean) ?? [];

  if (!space && explicitUrls.length === 0) {
    console.error(
      'Set YUQUE_SPACE (e.g. sgyxy/cangyun) or provide a comma-separated YUQUE_DOC_URLS list.'
    );
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let docUrls = explicitUrls;
  if (docUrls.length === 0 && space) {
    docUrls = await discoverUrls(page, space, DEFAULT_MAX_DOCS);
    if (docUrls.length === 0) {
      console.error(
        `Failed to auto-discover documents for ${space}. Please set YUQUE_DOC_URLS.`
      );
      await browser.close();
      process.exit(1);
    }
  }

  const uniqueUrls = Array.from(new Set(docUrls));
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  const saved: string[] = [];
  const slugCounts = new Map<string, number>();

  for (const url of uniqueUrls) {
    const sheetPayloads: SheetPayload[] = [];
    const responseListener = async (response: any) => {
      try {
        const contentType = response.headers()['content-type'] ?? '';
        if (!contentType.includes('application/json')) {
          return;
        }
        const lowerUrl = response.url().toLowerCase();
        const isSheetEndpoint =
          lowerUrl.includes('sheet') ||
          lowerUrl.includes('table') ||
          lowerUrl.includes('worksheet') ||
          lowerUrl.includes('grid');
        if (!isSheetEndpoint) {
          return;
        }
        const body = await response.text();
        if (!body?.trim()) {
          return;
        }
        sheetPayloads.push({ url: response.url(), body });
      } catch {
        // ignore malformed responses
      }
    };

    page.on('response', responseListener);

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      const article = await extractArticle(page);
      const scriptSheets = parseAppDataScripts(article.scripts);
      article.sheets.push(...scriptSheets);
      if (!article?.html) {
        console.warn(`Skipping ${url}: unable to locate article content.`);
        continue;
      }

      const baseSlug = createFileName(article.title, url);
      const slugIndex = slugCounts.get(baseSlug) ?? 0;
      const slug = slugIndex === 0 ? baseSlug : `${baseSlug}-${slugIndex + 1}`;
      slugCounts.set(baseSlug, slugIndex + 1);

      const canvasSections = await captureCanvasTables(page, slug);

      const markdown = buildMarkdown(
        article.title,
        article.html,
        article.sheets as InlineSheet[],
        sheetPayloads,
        canvasSections,
        turndown
      );
      const outputPath = path.join(OUTPUT_DIR, `${slug}.md`);

      await writeFile(outputPath, markdown, 'utf-8');
      console.info(
        `Saved ${article.title} → ${path.relative(process.cwd(), outputPath)}`
      );
      saved.push(outputPath);
    } catch (error) {
      console.error(`Failed to process ${url}:`, error);
    } finally {
      page.off('response', responseListener);
    }
  }

  await browser.close();

  console.info(
    `Exported ${saved.length} document(s) to ${path.relative(process.cwd(), OUTPUT_DIR)}`
  );
}

async function discoverUrls(page: Page, space: string, maxDocs: number) {
  const homeUrl = `https://www.yuque.com/${space}`;
  try {
    await page.goto(homeUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
  } catch (error) {
    console.error(`Failed to load ${homeUrl}:`, error);
    return [];
  }

  const collected = new Set<string>();
  const prefix = homeUrl.endsWith('/') ? homeUrl : `${homeUrl}/`;

  const apiSlugs = await page.evaluate(
    async ({ spaceSlug, limit }) => {
      try {
        const encoded = encodeURIComponent(spaceSlug);
        const chunk = Math.min(limit, 100);
        let offset = 0;
        const slugs: string[] = [];
        while (offset < limit) {
          const resp = await fetch(
            `/api/v2/repos/${encoded}/docs?offset=${offset}&limit=${chunk}`
          );
          if (!resp.ok) break;
          const json = await resp.json();
          const data = json?.data;
          if (!Array.isArray(data) || data.length === 0) break;
          for (const doc of data) {
            if (doc?.slug) {
              slugs.push(doc.slug);
            }
          }
          offset += data.length;
          if (data.length < chunk) break;
        }
        return slugs;
      } catch {
        return null;
      }
    },
    { spaceSlug: space, limit: maxDocs }
  );

  if (Array.isArray(apiSlugs)) {
    for (const slug of apiSlugs) {
      if (collected.size >= maxDocs) break;
      collected.add(`${prefix}${slug}`);
    }
  }

  for (
    let attempt = 0;
    attempt < MAX_SCROLL_ATTEMPTS && collected.size < maxDocs;
    attempt += 1
  ) {
    const batch = await page.evaluate(
      ({ spaceSlug }) => {
        const anchors = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('a[href]')
        );
        const origin = window.location.origin;
        const prefix = `${origin}/${spaceSlug}/`;
        const result: string[] = [];

        for (const anchor of anchors) {
          const href = anchor.getAttribute('href');
          if (!href) continue;
          const absolute = href.startsWith('http')
            ? href
            : new URL(href, origin).href;
          if (!absolute.startsWith(prefix)) continue;
          if (absolute.includes('/edit')) continue;
          const normalized = absolute.split('#')[0];
          result.push(normalized);
        }

        return result;
      },
      { spaceSlug: space }
    );

    batch.forEach(url => {
      if (collected.size < maxDocs) {
        collected.add(url);
      }
    });

    if (collected.size >= maxDocs) {
      break;
    }

    const loadMore = await findLoadMoreButton(page);
    if (loadMore) {
      await loadMore.click();
      await page.waitForTimeout(1200);
    } else {
      await autoScroll(page);
      await page.waitForTimeout(600);
    }
  }

  const urls = Array.from(collected).slice(0, maxDocs);
  console.info(`Discovered ${urls.length} document link(s) under ${homeUrl}`);
  return urls;
}

async function findLoadMoreButton(page: Page) {
  const selectors = [
    'button:has-text("加载更多")',
    'button:has-text("查看更多")',
    'a:has-text("加载更多")',
    'a:has-text("查看更多")',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        if (await locator.isVisible()) {
          return locator;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      let totalHeight = 0;
      const distance = window.innerHeight || 600;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight + window.innerHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 160);
    });
  });
}

async function extractArticle(page: Page): Promise<{
  title: string;
  html: string;
  sheets: InlineSheet[];
  scripts: string[];
}> {
  return page.evaluate(() => {
    const titleSelectors = [
      'header h1',
      'h1',
      '.doc-title',
      '.title',
      '[data-role="doc-title"]',
      '[class*="DocHeader"] h1',
    ];
    let title = document.title?.trim() ?? 'Untitled';
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        title = el.textContent.trim();
        break;
      }
    }

    const contentSelectors = [
      'article',
      '.ne-renderer',
      '.doc-content',
      '.markdown-body',
      '.reader-body',
      '[data-role="doc-content"]',
      '[class*="DocBody"]',
    ];

    const sheetSelectors = [
      '[data-res-type="sheet"]',
      '[data-resource-type="sheet"]',
      '[data-res-type="lake-sheet"]',
      '[data-type="sheet"]',
      '.lake-sheet',
    ];
    const sheetNodes = sheetSelectors.flatMap(selector =>
      Array.from(document.querySelectorAll(selector))
    );

    const sheets = sheetNodes.map(node => ({
      title:
        node.getAttribute('data-title') ||
        node.getAttribute('title') ||
        node.getAttribute('aria-label') ||
        '嵌入表格',
      dataset:
        node.getAttribute('data-value') ||
        node.getAttribute('data-data') ||
        node.getAttribute('data-raw') ||
        node.getAttribute('data-json') ||
        null,
      innerText: node.textContent || '',
    }));

    const scripts = Array.from(document.querySelectorAll('script')).map(
      script => script.textContent || ''
    );

    const container = document.body.cloneNode(true) as HTMLElement;
    container.querySelectorAll('script').forEach(node => node.remove());

    let html = '';
    for (const selector of contentSelectors) {
      const el = container.querySelector(selector);
      if (el) {
        html = el.innerHTML;
        break;
      }
    }

    if (!html) {
      html = container.innerHTML;
    }

    return { title, html, sheets, scripts };
  });
}

function buildMarkdown(
  title: string,
  html: string,
  sheets: InlineSheet[],
  payloads: SheetPayload[],
  canvasSections: string[],
  turndown: TurndownService
) {
  const body = turndown.turndown(html);
  const sheetSections = buildSheetSections(sheets, payloads);
  const canvasContent = canvasSections.join('');
  return `# ${title}\n\n${body}${sheetSections}${canvasContent}\n`;
}

function createFileName(title: string, url: string) {
  const slugFromTitle = slugify(title);
  if (slugFromTitle) {
    return slugFromTitle;
  }
  const parts = url.split('/');
  return slugify(parts[parts.length - 1]) || `doc-${Date.now()}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSheetSections(sheets: InlineSheet[], payloads: SheetPayload[]) {
  const sections: string[] = [];
  const seen = new Set<string>();

  for (const sheet of sheets) {
    const matrix = sheet.dataset ? parseSheetSource(sheet.dataset) : null;
    if (matrix) {
      const key = JSON.stringify(matrix);
      if (!seen.has(key)) {
        sections.push(renderTableSection(sheet.title, matrix));
        seen.add(key);
      }
    }
  }

  for (const payload of payloads) {
    const matrix = parseSheetSource(payload.body);
    if (!matrix) continue;
    const key = JSON.stringify(matrix);
    if (seen.has(key)) continue;
    sections.push(renderTableSection('嵌入表格', matrix));
    seen.add(key);
  }

  for (const sheet of sheets) {
    const text = sheet.innerText?.trim();
    if (!text) continue;
    const key = `text:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sections.push(`\n\n> ${sheet.title}\n\n\`\`\`\n${text}\n\`\`\`\n`);
  }

  return sections.join('');
}

function parseSheetSource(source: string) {
  try {
    const parsed = JSON.parse(source);
    return extractMatrix(parsed);
  } catch {
    return null;
  }
}

function extractMatrix(data: any): string[][] | null {
  const rows = findRowArray(data);
  if (!rows || !rows.length) {
    return null;
  }

  const matrix: string[][] = [];
  for (const row of rows) {
    const cells = extractCells(row);
    if (!cells) continue;
    const values = cells.map(cellToString);
    if (values.some(value => value.length > 0)) {
      matrix.push(values);
    }
  }

  if (!matrix.length) {
    return null;
  }

  return normalizeMatrix(matrix);
}

function findRowArray(source: any): any[] | null {
  if (!source) return null;

  if (Array.isArray(source) && source.length) {
    return source;
  }

  const candidates = [
    source?.rows,
    source?.data?.rows,
    source?.data?.body?.rows,
    source?.body?.rows,
    source?.body?.data,
    source?.sheet?.rows,
    source?.sheet?.data,
    source?.table?.rows,
    source?.table?.data,
    source?.celldata,
    source?.cells,
    source?.values,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return candidate;
    }
  }

  if (Array.isArray(source?.sheets)) {
    for (const sheet of source.sheets) {
      const nested = findRowArray(sheet);
      if (nested?.length) {
        return nested;
      }
    }
  }

  return null;
}

function extractCells(row: any): any[] | null {
  if (Array.isArray(row)) {
    return row;
  }
  if (Array.isArray(row?.cells)) {
    return row.cells;
  }
  if (Array.isArray(row?.data)) {
    return row.data;
  }
  if (Array.isArray(row?.columns)) {
    return row.columns;
  }
  if (row && typeof row === 'object') {
    const values = Object.values(row);
    if (values.length) {
      return values;
    }
  }
  return null;
}

function cellToString(cell: any): string {
  if (cell == null) return '';
  if (typeof cell === 'string') return cell.trim();
  if (typeof cell === 'number' || typeof cell === 'boolean')
    return String(cell);
  if (Array.isArray(cell)) {
    return cell.map(cellToString).filter(Boolean).join(' ');
  }
  if (typeof cell === 'object') {
    const preferredKeys = [
      'text',
      'value',
      'displayValue',
      'formattedValue',
      'content',
      'plainText',
      'label',
      'title',
      'raw',
    ];
    for (const key of preferredKeys) {
      if (cell[key] != null) {
        return cellToString(cell[key]);
      }
    }
    if (cell.children) {
      return cellToString(cell.children);
    }
    const firstPrimitive = Object.values(cell).find(value =>
      ['string', 'number', 'boolean'].includes(typeof value)
    );
    if (firstPrimitive != null) {
      return cellToString(firstPrimitive);
    }
    return '';
  }
  return '';
}

function normalizeMatrix(matrix: string[][]) {
  const filtered = matrix
    .map(row => row.map(cell => cell.trim()))
    .filter(row => row.some(cell => cell.length > 0));

  if (!filtered.length) {
    return [];
  }

  const maxWidth = Math.max(...filtered.map(row => row.length));
  const normalized = filtered.map(row => {
    const next = [...row];
    while (next.length < maxWidth) {
      next.push('');
    }
    return next;
  });

  const header = normalized[0];
  if (header.every(cell => !cell)) {
    for (let i = 0; i < header.length; i += 1) {
      header[i] = `列${i + 1}`;
    }
  }

  return normalized;
}

function renderTableSection(title: string, matrix: string[][]) {
  if (!matrix.length) return '';

  const header = matrix[0];
  const divider = `| ${header.map(() => '---').join(' | ')} |`;
  const rows = matrix
    .slice(1)
    .map(row => `| ${row.map(sanitizeCell).join(' | ')} |`);

  const table = [
    `| ${header.map(sanitizeCell).join(' | ')} |`,
    divider,
    ...rows,
  ].join('\n');
  return `\n\n## ${title}\n\n${table}\n`;
}

function sanitizeCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function captureCanvasTables(page: Page, slug: string) {
  const assetsDir = path.join(OUTPUT_DIR, 'images');
  await mkdir(assetsDir, { recursive: true });
  const selectors = [
    '[data-res-type="sheet"]',
    '[data-resource-type="sheet"]',
    '[data-res-type="lake-sheet"]',
    '.lake-sheet',
    '.lake-table-wrapper',
    '.lake-table',
  ];
  const sections: string[] = [];
  const seenBoxes = new Set<string>();
  let index = 1;

  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
      const target = locator.nth(i);
      if ((await target.locator('canvas').count()) === 0) {
        continue;
      }
      const box = await target.boundingBox();
      if (!box) continue;
      const key = `${Math.round(box.x)}:${Math.round(box.y)}:${Math.round(box.width)}:${Math.round(box.height)}`;
      if (seenBoxes.has(key)) continue;
      seenBoxes.add(key);

      const fileName = `${slug}-table-${String(index).padStart(2, '0')}.png`;
      const imagePath = path.join(assetsDir, fileName);
      await target.screenshot({ path: imagePath });
      let ocrText: string | undefined;
      if (OCR_ENABLED) {
        ocrText = await recognizeImage(imagePath);
      }
      sections.push(
        renderCanvasSection(`嵌入表格 ${index}`, fileName, ocrText)
      );
      index += 1;
    }
  }

  return sections;
}

function renderCanvasSection(
  title: string,
  fileName: string,
  ocrText?: string
) {
  let section = `\n\n## ${title}\n\n![${title}](./images/${fileName})\n`;
  if (ocrText) {
    section += `\n\n\`\`\`\n${ocrText}\n\`\`\`\n`;
  }
  return section;
}

let tesseractModule: Promise<any> | null = null;
async function recognizeImage(imagePath: string) {
  try {
    if (!tesseractModule) {
      tesseractModule = import('tesseract.js');
    }
    const { recognize } = await tesseractModule;
    const result = await recognize(imagePath, OCR_LANG, {
      logger: () => undefined,
    });
    return result?.data?.text?.trim() || undefined;
  } catch (error) {
    console.warn(`OCR failed for ${imagePath}:`, error);
    return undefined;
  }
}

function parseAppDataScripts(scripts: string[]) {
  const results: InlineSheet[] = [];
  const seenMatrices = new Set<string>();

  for (const script of scripts) {
    if (!script.includes('window.appData')) {
      continue;
    }

    let jsonString: string | null = null;
    const encodedMatch = script.match(
      /window\.appData\s*=\s*JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)/
    );
    if (encodedMatch) {
      try {
        jsonString = decodeURIComponent(encodedMatch[1]);
      } catch {
        jsonString = null;
      }
    }
    if (!jsonString) {
      const plainMatch = script.match(/window\.appData\s*=\s*(\{[\s\S]*?\});/);
      if (plainMatch) {
        jsonString = plainMatch[1];
      }
    }
    if (!jsonString) {
      continue;
    }

    try {
      const data = JSON.parse(jsonString);
      const visited = new Set<any>();
      collectSheetNodes(data, results, seenMatrices, visited, 0);
    } catch {
      // ignore malformed script payloads
    }
  }

  return results;
}

function collectSheetNodes(
  node: any,
  results: InlineSheet[],
  seenMatrices: Set<string>,
  visited: Set<any>,
  depth: number
) {
  if (!node || typeof node !== 'object') return;
  if (visited.has(node)) return;
  visited.add(node);
  if (depth > 6) return;

  const matrix = extractMatrix(node);
  if (matrix && matrix.length) {
    const key = JSON.stringify(matrix);
    if (!seenMatrices.has(key)) {
      results.push({
        title: node.title || node.name || node.sheetName || '嵌入表格',
        dataset: JSON.stringify(node),
      });
      seenMatrices.add(key);
    }
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectSheetNodes(item, results, seenMatrices, visited, depth + 1);
    }
  } else {
    for (const value of Object.values(node)) {
      collectSheetNodes(value, results, seenMatrices, visited, depth + 1);
    }
  }
}

function parseBoolean(value: string) {
  return ['true', '1', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
