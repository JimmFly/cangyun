import { cn } from '@cangyun-ai/ui/lib/utils';
import type { ChatMessage } from '../types';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-2',
        isAssistant ? 'items-start' : 'items-end'
      )}
    >
      <div
        className={cn(
          'max-w-3xl rounded-[1.75rem] border px-6 py-4 text-left text-base leading-relaxed shadow-[0_25px_80px_-60px_rgba(15,15,15,0.9)] transition',
          isAssistant
            ? 'border-white/15 bg-white/10 text-neutral-100 backdrop-blur'
            : 'border-transparent bg-white text-neutral-900'
        )}
      >
        <p className={message.pending ? 'animate-pulse opacity-80' : undefined}>
          {message.content || (message.pending ? '正在生成回答…' : '')}
        </p>
      </div>
    </div>
  );
}
