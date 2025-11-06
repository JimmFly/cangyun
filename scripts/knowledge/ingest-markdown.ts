#!/usr/bin/env tsx

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

// 加载环境变量
['.env.local', '.env']
  .map(file => path.resolve(process.cwd(), file))
  .forEach(envPath => {
    loadEnv({ path: envPath, override: false });
  });

const KNOWLEDGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../tmp/knowledge'
);

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';
const DEFAULT_MAX_TOKENS = Number.parseInt(
  process.env.KNOWLEDGE_MAX_TOKENS ?? '1800',
  10
);
let maxTokensPerChunk = Number.isFinite(DEFAULT_MAX_TOKENS)
  ? DEFAULT_MAX_TOKENS
  : 1800;

interface Chunk {
  content: string;
  order: number;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}

interface Document {
  externalId: string;
  title: string;
  sourceUrl?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 将Markdown文本分割成chunks
 * 按标题和段落分割，保持语义完整性
 */
function splitMarkdown(content: string, maxChunkSize = 1000): Chunk[] {
  const chunks: Chunk[] = [];
  const lines = content.split('\n');
  let currentChunk = '';
  let currentOrder = 0;
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 检测标题
    if (trimmed.startsWith('#')) {
      // 如果当前chunk有内容，先保存
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          order: currentOrder++,
          metadata: currentSection ? { section: currentSection } : undefined,
        });
        currentChunk = '';
      }

      // 提取标题作为section标识
      currentSection = trimmed.replace(/^#+\s*/, '');
      // 标题也作为chunk的一部分
      currentChunk = line + '\n';
    } else if (trimmed) {
      // 非空行添加到当前chunk
      currentChunk += line + '\n';
    } else {
      // 空行，如果当前chunk较大则分割
      if (currentChunk.length > maxChunkSize) {
        chunks.push({
          content: currentChunk.trim(),
          order: currentOrder++,
          metadata: currentSection ? { section: currentSection } : undefined,
        });
        currentChunk = '';
      } else {
        currentChunk += '\n';
      }
    }

    // 如果chunk超过最大大小，强制分割
    if (currentChunk.length > maxChunkSize * 1.5) {
      const parts = splitByParagraph(currentChunk, maxChunkSize);
      for (let j = 0; j < parts.length - 1; j++) {
        chunks.push({
          content: parts[j].trim(),
          order: currentOrder++,
          metadata: currentSection ? { section: currentSection } : undefined,
        });
      }
      currentChunk = parts[parts.length - 1];
    }
  }

  // 保存最后一个chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      order: currentOrder++,
      metadata: currentSection ? { section: currentSection } : undefined,
    });
  }

  return chunks.filter(chunk => chunk.content.length > 0);
}

/**
 * 按段落分割文本
 */
function splitByParagraph(text: string, maxSize: number): string[] {
  const parts: string[] = [];
  const paragraphs = text.split(/\n\n+/);

  let current = '';
  for (const para of paragraphs) {
    if (current.length + para.length > maxSize && current) {
      parts.push(current);
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current) {
    parts.push(current);
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * 从文件名提取标题（去掉扩展名和特殊字符）
 */
function extractTitle(filename: string, content: string): string {
  // 尝试从内容第一行提取标题
  const firstLine = content.split('\n')[0]?.trim();
  if (firstLine?.startsWith('# ')) {
    return firstLine.replace(/^#\s+/, '');
  }

  // 从文件名提取
  const baseName = path.basename(filename, '.md');
  return baseName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim();
}

/**
 * 导入单个Markdown文件
 */
async function ingestMarkdownFile(
  filePath: string,
  generateEmbeddings = true
): Promise<void> {
  const filename = path.basename(filePath);
  const content = await readFile(filePath, 'utf-8');
  const title = extractTitle(filename, content);
  const externalId = `md-${path.basename(filePath, '.md')}`;

  // 分割成chunks
  const rawChunks = splitMarkdown(content);
  const chunks = enforceTokenLimit(rawChunks, maxTokensPerChunk);

  if (chunks.length === 0) {
    console.warn(`⚠️  跳过 ${filename}: 没有有效内容`);
    return;
  }

  if (rawChunks.length !== chunks.length) {
    console.log(
      `   ✂️  依据 ${maxTokensPerChunk} tokens 上限重拆 chunks: ${rawChunks.length} → ${chunks.length}`
    );
  }

  console.log(
    `📄 处理 ${filename}: ${chunks.length} 个chunks, ${content.length} 字符`
  );

  // 如果chunks太多，分批导入（每次50个chunks）
  // 注意：当前API会替换所有chunks，所以需要先创建文档，然后分批追加
  if (chunks.length > 50) {
    console.log(`   ⚠️  chunks数量较多(${chunks.length})，分批导入...`);
    await ingestMarkdownFileInBatches(
      externalId,
      title,
      filename,
      filePath,
      chunks,
      generateEmbeddings
    );
    return;
  }

  // 构建请求体
  const payload = {
    document: {
      externalId,
      title,
      sourceUrl: `file://${filePath}`,
      metadata: {
        filename,
        fileSize: content.length,
        chunkCount: chunks.length,
      },
    },
    chunks: chunks.map((chunk, index) => ({
      content: chunk.content,
      order: chunk.order,
      tokenCount: estimateTokenCount(chunk.content),
      metadata: {
        ...chunk.metadata,
        chunkIndex: index,
      },
    })),
    generateEmbeddings,
  };

  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    const result = await response.json();
    console.log(
      `✅ 成功导入 ${filename}: 文档ID ${result.document.id}, ${result.chunks.length} chunks`
    );
  } catch (error) {
    console.error(`❌ 导入 ${filename} 失败:`, error);
    throw error;
  }
}

/**
 * 分批导入大文件
 * 由于API会替换所有chunks，所以需要累积所有chunks再一次性提交
 */
async function ingestMarkdownFileInBatches(
  externalId: string,
  title: string,
  filename: string,
  filePath: string,
  chunks: Chunk[],
  generateEmbeddings: boolean
): Promise<void> {
  const batchSize = 50;
  let allImportedChunks: Chunk[] = [];

  console.log(`   📦 将分 ${Math.ceil(chunks.length / batchSize)} 批导入...`);

  // 分批处理，但累积所有chunks后一次性提交
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    allImportedChunks.push(...batch);

    console.log(
      `   📝 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}: ${batch.length} chunks (累积 ${allImportedChunks.length}/${chunks.length})`
    );

    // 构建完整payload（包含所有已处理的chunks）
    const payload = {
      document: {
        externalId,
        title,
        sourceUrl: `file://${filePath}`,
        metadata: {
          filename,
          fileSize: chunks.reduce((sum, c) => sum + c.content.length, 0),
          chunkCount: chunks.length,
          importedChunks: allImportedChunks.length,
        },
      },
      chunks: allImportedChunks.map((chunk, idx) => ({
        content: chunk.content,
        order: chunk.order,
        tokenCount: estimateTokenCount(chunk.content),
        metadata: {
          ...chunk.metadata,
          chunkIndex: idx,
        },
      })),
      // 只在最后一批生成embeddings
      generateEmbeddings:
        i + batchSize >= chunks.length ? generateEmbeddings : false,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/knowledge/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(
        `   ✅ 批次 ${Math.floor(i / batchSize) + 1} 完成: ${allImportedChunks.length} chunks已导入`
      );

      // 如果这是最后一批，完成
      if (i + batchSize >= chunks.length) {
        console.log(
          `✅ 成功导入 ${filename}: 文档ID ${result.document.id}, ${result.chunks.length} chunks`
        );
        break;
      }
    } catch (error) {
      console.error(`❌ 批次 ${Math.floor(i / batchSize) + 1} 失败:`, error);
      throw error;
    }
  }
}

/**
 * 估算token数量（简单估算：中文约1.5字符/token，英文约4字符/token）
 */
function estimateTokenCount(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

function enforceTokenLimit(chunks: Chunk[], maxTokens: number): Chunk[] {
  const normalized: Chunk[] = [];

  for (const chunk of chunks) {
    const pieces = splitChunkByTokenLimit(chunk.content, maxTokens);
    pieces.forEach((content, idx) => {
      if (!content.trim()) return;
      normalized.push({
        content: content.trim(),
        order: normalized.length,
        metadata: {
          ...chunk.metadata,
          originalOrder: chunk.order,
          splitIndex: idx,
        },
      });
    });
  }

  return normalized.map((chunk, index) => ({
    ...chunk,
    order: index,
  }));
}

function splitChunkByTokenLimit(text: string, maxTokens: number): string[] {
  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }

  if (estimateTokenCount(cleaned) <= maxTokens) {
    return [cleaned];
  }

  const paragraphGroups = groupByToken(
    cleaned.split(/\n{2,}/),
    '\n\n',
    maxTokens
  );
  const results: string[] = [];

  for (const group of paragraphGroups) {
    if (!group.trim()) continue;
    if (estimateTokenCount(group) <= maxTokens) {
      results.push(group.trim());
      continue;
    }

    const sentenceGroups = groupByToken(
      group.split(/(?<=[。！？!?\.])\s+/),
      ' ',
      maxTokens
    );

    for (const sentenceBlock of sentenceGroups) {
      if (!sentenceBlock.trim()) continue;
      if (estimateTokenCount(sentenceBlock) <= maxTokens) {
        results.push(sentenceBlock.trim());
      } else {
        results.push(
          ...splitByCharacters(sentenceBlock, maxTokens).map(part =>
            part.trim()
          )
        );
      }
    }
  }

  return results.filter(Boolean);
}

function groupByToken(
  segments: string[],
  joiner: string,
  maxTokens: number
): string[] {
  const result: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) {
      continue;
    }

    const tokens = estimateTokenCount(segment);
    if (tokens > maxTokens) {
      if (current.length) {
        result.push(current.join(joiner).trim());
        current = [];
        currentTokens = 0;
      }
      result.push(segment);
      continue;
    }

    if (currentTokens + tokens <= maxTokens || currentTokens === 0) {
      current.push(segment);
      currentTokens += tokens;
    } else {
      result.push(current.join(joiner).trim());
      current = [segment];
      currentTokens = tokens;
    }
  }

  if (current.length) {
    result.push(current.join(joiner).trim());
  }

  return result;
}

function splitByCharacters(text: string, maxTokens: number): string[] {
  const maxChars = Math.max(200, maxTokens);
  const parts: string[] = [];

  for (let start = 0; start < text.length; start += maxChars) {
    const slice = text.slice(start, start + maxChars).trim();
    if (slice) {
      parts.push(slice);
    }
  }

  return parts.length ? parts : [text];
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const generateEmbeddings = !args.includes('--no-embeddings');
  const maxTokensArg = args
    .find(arg => arg.startsWith('--max-tokens='))
    ?.split('=')[1];
  if (maxTokensArg) {
    const parsed = Number.parseInt(maxTokensArg, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      maxTokensPerChunk = parsed;
    }
  }
  const specificFiles = args.filter(arg => !arg.startsWith('--'));

  try {
    // 获取所有Markdown文件
    const files = await readdir(KNOWLEDGE_DIR);
    const mdFiles = specificFiles.length
      ? specificFiles.map(f => (f.endsWith('.md') ? f : `${f}.md`))
      : files.filter(f => f.endsWith('.md'));

    if (mdFiles.length === 0) {
      console.error(`❌ 在 ${KNOWLEDGE_DIR} 中没有找到Markdown文件`);
      process.exit(1);
    }

    console.log(
      `🚀 开始导入 ${mdFiles.length} 个Markdown文件${generateEmbeddings ? ' (生成embeddings)' : ''}...\n`
    );

    let successCount = 0;
    let failCount = 0;

    for (const file of mdFiles) {
      const filePath = path.join(KNOWLEDGE_DIR, file);
      try {
        await ingestMarkdownFile(filePath, generateEmbeddings);
        successCount++;
      } catch (error) {
        failCount++;
        console.error(`  错误详情:`, error);
      }
      console.log(''); // 空行分隔
    }

    console.log(`\n📊 导入完成: ${successCount} 成功, ${failCount} 失败`);
  } catch (error) {
    console.error('❌ 导入过程出错:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
