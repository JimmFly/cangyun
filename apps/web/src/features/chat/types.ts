export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  pending?: boolean;
}

export interface ChatSource {
  id: string;
  chunkId: string;
  title: string;
  url?: string;
  order: number;
}

export interface ChatHistoryMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequestPayload {
  question: string;
  history: ChatHistoryMessage[];
  topK?: number;
}
