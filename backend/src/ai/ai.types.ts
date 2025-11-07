export type AiMessageRole = 'system' | 'user' | 'assistant';

export interface AiMessage {
  role: AiMessageRole;
  content: string;
}

export interface GenerateTextOptions {
  model?: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: Record<string, unknown>;
  maxToolRoundtrips?: number;
}

export interface GenerateTextResult {
  content: string;
  finishReason?: string | null;
  raw?: unknown;
}

export interface EmbedTextOptions {
  model?: string;
  inputs: string[];
}

export interface EmbedTextResult {
  embeddings: number[][];
  raw?: unknown;
}
