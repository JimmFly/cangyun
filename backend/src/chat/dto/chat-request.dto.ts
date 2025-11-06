export type ChatMessageRole = 'user' | 'assistant';

export interface ChatMessageDto {
  role: ChatMessageRole;
  content: string;
}

export interface ChatRequestDto {
  question: string;
  topK?: number;
  history?: ChatMessageDto[];
}
