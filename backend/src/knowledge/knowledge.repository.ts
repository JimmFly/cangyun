import type {
  KnowledgeChunk,
  KnowledgeChunkInput,
  KnowledgeDocument,
  KnowledgeDocumentInput,
  KnowledgeSearchResult,
} from './knowledge.types.js';

export interface KnowledgeRepository {
  upsertDocument(input: KnowledgeDocumentInput): Promise<KnowledgeDocument>;
  replaceChunks(
    documentId: string,
    chunks: KnowledgeChunkInput[],
  ): Promise<KnowledgeChunk[]>;
  search(
    query: string,
    limit: number,
    embedding?: number[],
  ): Promise<KnowledgeSearchResult[]>;
  listDocuments(): Promise<KnowledgeDocument[]>;
}

export const KNOWLEDGE_REPOSITORY_TOKEN = Symbol('KNOWLEDGE_REPOSITORY');
