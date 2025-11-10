import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/index.js';
import type {
  KnowledgeChunk,
  KnowledgeChunkInput,
  KnowledgeDocument,
  KnowledgeDocumentInput,
  KnowledgeSearchResult,
} from './knowledge.types.js';
import type { KnowledgeRepository } from './knowledge.repository.js';

interface DocumentRow {
  id: string;
  external_id: string;
  title: string;
  source_url: string | null;
  version: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  order: number;
  token_count: number | null;
  embedding: string | number[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  text_rank?: number;
  vector_rank?: number;
}

type SearchRow = ChunkRow &
  DocumentRow & {
    document_metadata: DocumentRow['metadata'];
    document_created_at: DocumentRow['created_at'];
    document_updated_at: DocumentRow['updated_at'];
  };

@Injectable()
export class PostgresKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly database: DatabaseService) {}

  async upsertDocument(
    input: KnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    const pool = this.database.getPool();
    const metadata = input.metadata ?? {};
    const insertId = randomUUID();

    const { rows } = await pool.query<DocumentRow>(
      `INSERT INTO knowledge_documents (
        id,
        external_id,
        title,
        source_url,
        version,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (external_id) DO UPDATE
      SET
        title = EXCLUDED.title,
        source_url = EXCLUDED.source_url,
        version = EXCLUDED.version,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *`,
      [
        insertId,
        input.externalId,
        input.title,
        input.sourceUrl ?? null,
        input.version ?? null,
        JSON.stringify(metadata),
      ],
    );

    return this.mapDocument(rows[0]);
  }

  async replaceChunks(
    documentId: string,
    chunks: KnowledgeChunkInput[],
  ): Promise<KnowledgeChunk[]> {
    const client = await this.database.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM knowledge_chunks WHERE document_id = $1',
        [documentId],
      );

      const results: KnowledgeChunk[] = [];
      for (const chunk of chunks) {
        const chunkId = randomUUID();
        const vectorLiteral = toVectorLiteral(chunk.embedding);

        const { rows } = await client.query<ChunkRow>(
          `INSERT INTO knowledge_chunks (
            id,
            document_id,
            content,
            "order",
            token_count,
            embedding,
            metadata,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::vector,
            $7::jsonb,
            NOW(),
            NOW()
          )
          RETURNING *`,
          [
            chunkId,
            documentId,
            chunk.content,
            chunk.order,
            chunk.tokenCount ?? null,
            vectorLiteral,
            JSON.stringify(chunk.metadata ?? {}),
          ],
        );

        results.push(this.mapChunk(rows[0]));
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async search(
    query: string,
    limit: number,
    embedding?: number[],
  ): Promise<KnowledgeSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }

    const pool = this.database.getPool();
    const vectorLiteral = toVectorLiteral(embedding);
    const { rows } = await pool.query<SearchRow>(
      `
      SELECT
        c.*,
        d.id AS document_id,
        d.external_id,
        d.title,
        d.source_url,
        d.version,
        d.metadata AS document_metadata,
        d.created_at AS document_created_at,
        d.updated_at AS document_updated_at,
        ts_rank_cd(
          to_tsvector('simple', coalesce(c.content, '')),
          plainto_tsquery('simple', $1)
        ) AS text_rank,
        CASE
          WHEN $3::vector IS NULL OR c.embedding IS NULL THEN NULL
          ELSE 1 - (c.embedding <=> $3::vector)
        END AS vector_rank
      FROM knowledge_chunks c
      INNER JOIN knowledge_documents d ON d.id = c.document_id
      WHERE
        (
          $3::vector IS NOT NULL
          AND c.embedding IS NOT NULL
        )
        OR plainto_tsquery('simple', $1) @@ to_tsvector('simple', coalesce(c.content, ''))
        OR c.content ILIKE '%' || $1 || '%'
      ORDER BY
        COALESCE(
          CASE
            WHEN $3::vector IS NULL OR c.embedding IS NULL THEN NULL
            ELSE 1 - (c.embedding <=> $3::vector)
          END,
          0
        ) DESC,
        COALESCE(
          ts_rank_cd(
            to_tsvector('simple', coalesce(c.content, '')),
            plainto_tsquery('simple', $1)
          ),
          0
        ) DESC,
        c."order" ASC,
        c.updated_at DESC
      LIMIT $2
      `,
      [trimmed, limit, vectorLiteral],
    );

    return rows.map((row: SearchRow) => ({
      chunk: this.mapChunk(row),
      score:
        (typeof row.vector_rank === 'number' ? row.vector_rank : 0) +
        (typeof row.text_rank === 'number' ? row.text_rank : 0),
      document: this.mapDocument({
        id: row.document_id,
        external_id: row.external_id,
        title: row.title,
        source_url: row.source_url,
        version: row.version,
        metadata: row.document_metadata,
        created_at: row.document_created_at,
        updated_at: row.document_updated_at,
      }),
    }));
  }

  async listDocuments(): Promise<KnowledgeDocument[]> {
    const pool = this.database.getPool();
    const { rows } = await pool.query<DocumentRow>(
      `
      SELECT *
      FROM knowledge_documents
      ORDER BY updated_at DESC
      `,
    );

    return rows.map((row: DocumentRow) => this.mapDocument(row));
  }

  private mapDocument(row: DocumentRow): KnowledgeDocument {
    return {
      id: row.id,
      externalId: row.external_id,
      title: row.title,
      sourceUrl: row.source_url ?? undefined,
      version: row.version ?? undefined,
      metadata: row.metadata ?? {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapChunk(row: ChunkRow): KnowledgeChunk {
    return {
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      order: row.order,
      tokenCount: row.token_count ?? undefined,
      embedding: parseVector(row.embedding),
      metadata: row.metadata ?? {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

function toVectorLiteral(values?: number[] | null): string | null {
  if (!values || values.length === 0) {
    return null;
  }
  const joined = values.join(',');
  return `[${joined}]`;
}

function parseVector(
  value: string | number[] | null | undefined,
): number[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(number);
  }

  const trimmed = value.trim().replace(/^\[|\]$/g, '');
  if (!trimmed) {
    return undefined;
  }
  return trimmed.split(',').map(number);
}

function number(token: string | number): number {
  return typeof token === 'number' ? token : Number.parseFloat(token);
}
