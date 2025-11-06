export interface KnowledgeDocumentInput {
  externalId: string;
  title: string;
  sourceUrl?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeChunkInput {
  content: string;
  order: number;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface KnowledgeDocument extends KnowledgeDocumentInput {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeChunk extends KnowledgeChunkInput {
  id: string;
  documentId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeSearchResult {
  chunk: KnowledgeChunk;
  score: number;
  document: KnowledgeDocument;
}
