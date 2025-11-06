import { z } from 'zod';

export const knowledgeChunkSchema = z.object({
  content: z.string().min(1, 'chunk content is required'),
  order: z.number().int().nonnegative(),
  tokenCount: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const knowledgeDocumentSchema = z.object({
  externalId: z.string().min(1, 'externalId is required'),
  title: z.string().min(1, 'title is required'),
  sourceUrl: z.string().url().optional(),
  version: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ingestDocumentSchema = z.object({
  document: knowledgeDocumentSchema,
  chunks: z
    .array(knowledgeChunkSchema)
    .min(1, 'at least one chunk is required'),
  generateEmbeddings: z.boolean().optional(),
});

export type IngestDocumentDto = z.infer<typeof ingestDocumentSchema>;
