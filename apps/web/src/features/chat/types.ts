import type {
  ChatHistoryMessage as SharedChatHistoryMessage,
  ChatRequestPayload as SharedChatRequestPayload,
  ChatSource as SharedChatSource,
  ChatMessageRole,
} from '@cangyun-ai/types';

export type ChatRole = ChatMessageRole;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  pending?: boolean;
}

export type ChatSource = SharedChatSource;
export type ChatHistoryMessage = SharedChatHistoryMessage;
export type ChatRequestPayload = SharedChatRequestPayload;
