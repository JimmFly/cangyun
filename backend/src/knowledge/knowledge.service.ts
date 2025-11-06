import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIService } from '../ai/index.js';
import type {
  KnowledgeChunk,
  KnowledgeChunkInput,
  KnowledgeDocument,
  KnowledgeDocumentInput,
  KnowledgeSearchResult,
} from './knowledge.types.js';
import { KNOWLEDGE_REPOSITORY_TOKEN } from './knowledge.repository.js';
import type { KnowledgeRepository } from './knowledge.repository.js';

export interface IndexDocumentOptions {
  document: KnowledgeDocumentInput;
  chunks: KnowledgeChunkInput[];
  generateEmbeddings?: boolean;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly aiService: AIService,
    @Inject(KNOWLEDGE_REPOSITORY_TOKEN)
    private readonly repository: KnowledgeRepository,
  ) {}

  async indexDocument(options: IndexDocumentOptions): Promise<{
    document: KnowledgeDocument;
    chunks: KnowledgeChunk[];
  }> {
    const document = await this.repository.upsertDocument(options.document);

    let chunkInputs = options.chunks;

    if (options.generateEmbeddings) {
      const embeddings = await this.generateEmbeddings(options.chunks);
      chunkInputs = options.chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index],
      }));
    }

    const chunks = await this.repository.replaceChunks(
      document.id,
      chunkInputs,
    );

    return { document, chunks };
  }

  async search(query: string, limit = 6): Promise<KnowledgeSearchResult[]> {
    let embedding: number[] | undefined;
    try {
      const vectorResult = await this.aiService.embedText({
        inputs: [query],
      });
      embedding = vectorResult.embeddings[0];
    } catch (error) {
      this.logger.warn(
        `Failed to generate query embedding: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return this.repository.search(query, limit, embedding);
  }

  listDocuments(): Promise<KnowledgeDocument[]> {
    return this.repository.listDocuments();
  }

  private async generateEmbeddings(
    chunks: KnowledgeChunkInput[],
  ): Promise<(number[] | undefined)[]> {
    try {
      const result = await this.aiService.embedText({
        inputs: chunks.map((chunk) => chunk.content),
      });
      return result.embeddings;
    } catch (error) {
      this.logger.error(
        'Failed to generate embeddings, falling back without vectors',
        error instanceof Error ? error.stack : error,
      );
      return chunks.map(() => undefined);
    }
  }
}
