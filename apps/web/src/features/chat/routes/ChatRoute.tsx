import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@cangyun-ai/ui/components/ui/button';
import { CardContent } from '@cangyun-ai/ui/components/ui/card';
import { Separator } from '@cangyun-ai/ui/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cangyun-ai/ui/components/ui/select';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Response } from '@/components/ai-elements/response';
import { Loader } from '@/components/ai-elements/loader';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources';
import type { ChatSource } from '../types';
import { CustomChatTransport } from '../utils/custom-chat-transport';

const INTRO_MESSAGE = `你好，我是苍云分山劲循环助手。告诉我你卡住的技能循环、装备或手法，我会结合知识库提供建议。`;

export function ChatRoute() {
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [topK, setTopK] = useState('6');
  const [input, setInput] = useState('');
  const transportRef = useRef<CustomChatTransport | null>(null);

  // 创建自定义 transport
  if (!transportRef.current) {
    transportRef.current = new CustomChatTransport({
      api: '/api/v1/chat',
      onSources: sources => {
        setSources(sources);
      },
    });
  }

  const { messages, sendMessage, status, stop } = useChat({
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [{ type: 'text', text: INTRO_MESSAGE }],
      },
    ],
    transport: transportRef.current,
  });

  // 更新 transport 的 onSources handler
  useEffect(() => {
    if (transportRef.current) {
      transportRef.current.setOnSources(setSources);
    }
  }, []);

  const submitMessage = () => {
    if (!input.trim() || status === 'streaming') return;

    // 发送消息时包含 topK 参数（通过 body 传递）
    sendMessage(
      { text: input },
      {
        body: {
          topK: Number.parseInt(topK, 10) || 6,
        },
      }
    );
    setInput('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMessage();
  };

  const handlePromptInputSubmit = (
    _message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    submitMessage();
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-full min-h-0 flex-col text-neutral-50">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-0 px-0 py-0">
          <div className="flex min-h-0 flex-1 flex-col">
            <Conversation className="flex min-h-0 flex-1 flex-col">
              <ConversationContent className="flex flex-col gap-8 bg-transparent px-4 py-8">
                {messages.map((message: UIMessage) => (
                  <Message key={message.id} from={message.role}>
                    <MessageContent
                      variant={
                        message.role === 'assistant' ? 'flat' : 'contained'
                      }
                      className="max-w-[85%]"
                    >
                      {message.parts.map((part, index) => {
                        if (part.type === 'text') {
                          return (
                            <Response key={`${message.id}-${index}`}>
                              {part.text}
                            </Response>
                          );
                        }
                        return null;
                      })}
                    </MessageContent>
                  </Message>
                ))}
                {status === 'streaming' && <Loader />}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="shrink-0 border-t border-white/10 bg-white/5 px-4 py-3">
              <form
                onSubmit={handleSubmit}
                className="mx-auto flex max-w-3xl flex-col gap-2"
              >
                <PromptInput
                  className="w-full"
                  onSubmit={handlePromptInputSubmit}
                >
                  <PromptInputTextarea
                    value={input}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                      setInput(event.currentTarget.value);
                    }}
                    placeholder="输入消息..."
                    className="min-h-[52px] max-h-[200px] resize-none rounded-lg border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus-visible:ring-2 focus-visible:ring-white/30"
                    disabled={status === 'streaming'}
                    onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        submitMessage();
                      }
                    }}
                  />
                  <PromptInputFooter>
                    <PromptInputTools>
                      <div className="flex flex-col gap-2 text-xs text-neutral-400 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">检索片段</span>
                          <Select
                            value={topK}
                            onValueChange={setTopK}
                            disabled={status === 'streaming'}
                          >
                            <SelectTrigger className="h-7 w-20 rounded-md border-white/20 bg-white/15 text-xs text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-white/10 bg-neutral-900 text-white">
                              <SelectItem value="3">3</SelectItem>
                              <SelectItem value="6">6</SelectItem>
                              <SelectItem value="8">8</SelectItem>
                              <SelectItem value="10">10</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {status === 'streaming' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={stop}
                            className="h-7 rounded-md border-white/20 bg-white/10 text-xs text-white hover:bg-white/20"
                          >
                            停止
                          </Button>
                        )}
                      </div>
                    </PromptInputTools>
                    <PromptInputSubmit
                      status={status === 'streaming' ? 'streaming' : 'ready'}
                      disabled={!input.trim() || status === 'streaming'}
                    />
                  </PromptInputFooter>
                </PromptInput>
              </form>
            </div>
          </div>

          {sources.length > 0 && (
            <div className="shrink-0 border-t border-white/10 bg-white/5 px-4 py-3">
              <Sources
                defaultOpen
                className="mx-auto max-w-3xl rounded-lg text-white"
              >
                <SourcesTrigger
                  count={sources.length}
                  className="flex w-full items-center justify-between rounded-md border border-white/10 bg-black/25 px-3 py-2 text-left text-xs font-medium text-neutral-200 transition hover:border-white/20 hover:text-white"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-400">
                      引用资料 ({sources.length})
                    </span>
                  </div>
                  <ChevronDown className="h-3 w-3" />
                </SourcesTrigger>
                <Separator className="my-2 border-white/10" />
                <SourcesContent>
                  <ul className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                    {sources.map(source => (
                      <li
                        key={source.chunkId}
                        className="group flex items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-2 transition hover:border-white/20"
                      >
                        <span className="text-xs text-neutral-500">
                          {String(source.order + 1).padStart(2, '0')}
                        </span>
                        <Source
                          href={source.url ?? '#'}
                          title={source.title}
                          className="flex flex-1 items-center gap-2 text-left text-xs text-neutral-200 transition group-hover:text-white"
                        />
                      </li>
                    ))}
                  </ul>
                </SourcesContent>
              </Sources>
            </div>
          )}
        </CardContent>
      </div>
    </div>
  );
}
