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
import { ChevronDown, CopyIcon, RefreshCw, AlertCircle, X } from 'lucide-react';
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
import { Actions, Action } from '@/components/ai-elements/actions';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources';
import {
  ChainOfThought,
  ChainOfThoughtStep,
  ChainOfThoughtContent,
} from '@/components/ai-elements/chain-of-thought';
import { Search, Database, Globe, Sparkles } from 'lucide-react';
import type { ChatSource } from '../types';
import { CustomChatTransport } from '../utils/custom-chat-transport';

const INTRO_MESSAGE = `你好，我是苍云分山劲循环助手。告诉我你卡住的技能循环、装备或手法，我会结合知识库提供建议。`;

interface AgentStep {
  step: string;
  label: string;
  tool?: string;
  agent?: string;
  status: 'complete' | 'active' | 'pending';
}

export function ChatRoute() {
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [topK, setTopK] = useState('6');
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
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

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [{ type: 'text', text: INTRO_MESSAGE }],
      },
    ],
    transport: transportRef.current,
    onData: data => {
      // 处理 Agent 状态事件
      if (
        data &&
        typeof data === 'object' &&
        'type' in data &&
        data.type === 'agent-status'
      ) {
        const statusData = data as {
          type: string;
          step: string;
          label: string;
          tool?: string;
          agent?: string;
        };
        setAgentSteps(prev => {
          const existing = prev.find(s => s.step === statusData.step);
          if (existing) {
            // 更新现有步骤为 active
            return prev.map(s =>
              s.step === statusData.step
                ? { ...s, ...statusData, status: 'active' as const }
                : s.status === 'active'
                  ? { ...s, status: 'complete' as const }
                  : s
            );
          }
          // 添加新步骤
          return [
            ...prev.map(s =>
              s.status === 'active' ? { ...s, status: 'complete' as const } : s
            ),
            { ...statusData, status: 'active' as const },
          ];
        });
      }
    },
  });

  // 更新 transport 的 onSources handler
  useEffect(() => {
    if (transportRef.current) {
      transportRef.current.setOnSources(setSources);
    }
  }, []);

  // 当开始流式响应时，重置 pending（由 status 控制文案）
  // 注意：只有在明确进入 streaming 状态时才重置 pending
  // 这样可以确保在消息发送后、服务器响应前，pending 保持为 true
  useEffect(() => {
    if (status === 'streaming' && pending) {
      setPending(false);
    }
    // 如果状态不是 streaming 且 pending 仍为 true，说明请求已完成或失败，重置 pending
    if (status !== 'streaming' && pending) {
      // 延迟一点重置，确保 UI 有时间显示最终状态
      const timer = setTimeout(() => {
        setPending(false);
        // 将所有 active 步骤标记为 complete
        setAgentSteps(prev =>
          prev.map(s =>
            s.status === 'active' ? { ...s, status: 'complete' } : s
          )
        );
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [status, pending]);

  // 监听消息中的错误
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant') {
      // 查找错误类型的 part
      for (const part of lastMessage.parts) {
        const partAny = part as { type?: string; errorText?: unknown };
        if (
          partAny.type === 'error' &&
          'errorText' in partAny &&
          typeof partAny.errorText === 'string'
        ) {
          setError(partAny.errorText);
          return;
        }
      }
      // 如果没有错误，清除错误状态
      if (error) {
        setError(null);
      }
    }
  }, [messages, error]);

  const submitMessage = () => {
    if (!input.trim() || status === 'streaming') return;

    // 发送消息时包含 topK 参数（通过 body 传递）
    setPending(true);
    setError(null); // 清除之前的错误
    setAgentSteps([]); // 重置 Agent 步骤
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
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex h-full flex-col text-neutral-50">
        <CardContent className="flex h-full flex-1 flex-col gap-0 overflow-hidden px-0 py-0">
          <div className="flex h-full flex-1 flex-col overflow-hidden">
            <Conversation className="flex h-full flex-1 flex-col">
              <ConversationContent className="flex flex-col gap-6 bg-transparent px-4 py-6 md:px-6 md:py-8">
                {messages.map((message: UIMessage, messageIndex) => {
                  const isAssistant = message.role === 'assistant';
                  const messageText = message.parts
                    .filter(part => part.type === 'text')
                    .map(part => part.text)
                    .join('');

                  // 检查是否是最后一条消息且正在生成但还没有内容
                  const isLastMessage = messageIndex === messages.length - 1;
                  const isEmptyAndStreaming =
                    isAssistant &&
                    isLastMessage &&
                    (status === 'streaming' || pending) &&
                    (!messageText || messageText.trim() === '');

                  const handleCopy = async () => {
                    if (messageText) {
                      await navigator.clipboard.writeText(messageText);
                    }
                  };

                  const handleRegenerate = () => {
                    if (messageIndex > 0) {
                      // 找到上一条用户消息
                      const userMessages = messages
                        .slice(0, messageIndex)
                        .filter(m => {
                          const mAny = m as { role?: string };
                          return mAny.role === 'user';
                        }) as Array<UIMessage & { role: 'user' }>;
                      const lastUserMessage =
                        userMessages[userMessages.length - 1];
                      if (lastUserMessage) {
                        const userMessageText = lastUserMessage.parts
                          .filter(part => part.type === 'text')
                          .map(part => part.text)
                          .join('');
                        // 移除当前 assistant 消息及之后的消息
                        setMessages(messages.slice(0, messageIndex));
                        // 重新发送用户消息
                        sendMessage({ text: userMessageText });
                      }
                    }
                  };

                  return (
                    <Message key={message.id} from={message.role}>
                      <MessageContent
                        variant={isAssistant ? 'flat' : 'contained'}
                        className="max-w-[90%] md:max-w-[85%]"
                      >
                        {isEmptyAndStreaming ? (
                          <div className="space-y-3 py-2">
                            <div className="flex items-center gap-2.5">
                              <div className="h-1.5 w-1.5 rounded-full bg-neutral-400/50 animate-pulse" />
                              <div className="h-4 w-32 rounded bg-neutral-400/30 animate-pulse" />
                            </div>
                            <div className="flex items-center gap-2.5">
                              <div className="h-1.5 w-1.5 rounded-full bg-neutral-400/40 animate-pulse" />
                              <div className="h-4 w-48 rounded bg-neutral-400/25 animate-pulse" />
                            </div>
                            <div className="flex items-center gap-2.5">
                              <div className="h-1.5 w-1.5 rounded-full bg-neutral-400/30 animate-pulse" />
                              <div className="h-4 w-40 rounded bg-neutral-400/20 animate-pulse" />
                            </div>
                          </div>
                        ) : (
                          message.parts.map((part, index) => {
                            if (part.type === 'text') {
                              return (
                                <Response key={`${message.id}-${index}`}>
                                  {part.text}
                                </Response>
                              );
                            }
                            return null;
                          })
                        )}
                        {isAssistant &&
                          messageText &&
                          messageText !== INTRO_MESSAGE && (
                            <Actions className="mt-2 justify-start">
                              <Action
                                tooltip="复制"
                                onClick={handleCopy}
                                className="text-neutral-400 hover:text-white"
                              >
                                <CopyIcon className="size-4" />
                              </Action>
                              <Action
                                tooltip="重新生成"
                                onClick={handleRegenerate}
                                disabled={
                                  status === 'streaming' || messageIndex === 0
                                }
                                className="text-neutral-400 hover:text-white disabled:opacity-50"
                              >
                                <RefreshCw className="size-4" />
                              </Action>
                            </Actions>
                          )}
                      </MessageContent>
                    </Message>
                  );
                })}
                {error && (
                  <Message from="assistant">
                    <MessageContent
                      variant="flat"
                      className="max-w-[90%] md:max-w-[85%]"
                    >
                      <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium">错误提示</p>
                          <p className="mt-1 text-xs text-red-400">{error}</p>
                        </div>
                        <button
                          onClick={() => setError(null)}
                          className="shrink-0 text-red-400 hover:text-red-300"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    </MessageContent>
                  </Message>
                )}
                {(pending ||
                  status === 'streaming' ||
                  agentSteps.length > 0) && (
                  <Message from="assistant">
                    <MessageContent
                      variant="flat"
                      className="max-w-[90%] md:max-w-[85%]"
                    >
                      {agentSteps.length > 0 ? (
                        <ChainOfThought defaultOpen={true}>
                          <ChainOfThoughtContent>
                            {agentSteps.map((step, index) => {
                              let Icon = Search;
                              if (step.step.includes('knowledge')) {
                                Icon = Database;
                              } else if (step.step.includes('external')) {
                                Icon = Globe;
                              } else if (step.step === 'generating') {
                                Icon = Sparkles;
                              }

                              return (
                                <ChainOfThoughtStep
                                  key={`${step.step}-${index}`}
                                  label={step.label}
                                  description={
                                    step.tool && step.agent
                                      ? `${step.agent} · ${step.tool}`
                                      : step.tool || step.agent
                                  }
                                  status={step.status}
                                  icon={Icon}
                                />
                              );
                            })}
                          </ChainOfThoughtContent>
                        </ChainOfThought>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Loader />
                          <span className="ml-2 text-neutral-400">
                            {status === 'streaming' ? '生成中…' : '发送中…'}
                          </span>
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="shrink-0 border-t border-white/10 px-4 py-4 md:px-6 md:py-5">
              <form
                onSubmit={handleSubmit}
                className="mx-auto flex w-full max-w-3xl flex-col gap-3"
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
                    className="min-h-[56px] max-h-[200px] resize-none rounded-xl border-white/20 bg-white/10 px-4 py-3.5 text-sm text-white placeholder:text-neutral-500 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
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
                      <div className="flex flex-col gap-2.5 text-xs text-neutral-400 sm:flex-row sm:items-center sm:gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs text-neutral-300">
                            参考文档数量
                          </span>
                          <Select
                            value={topK}
                            onValueChange={setTopK}
                            disabled={status === 'streaming'}
                          >
                            <SelectTrigger className="h-7 w-20 rounded-md border-white/20 bg-white/15 text-xs text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-white/10 bg-neutral-900 text-white">
                              <SelectItem value="3">3 篇</SelectItem>
                              <SelectItem value="6">6 篇</SelectItem>
                              <SelectItem value="8">8 篇</SelectItem>
                              <SelectItem value="10">10 篇</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(pending || status === 'streaming') && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-neutral-300">
                              {status === 'streaming' ? '生成中…' : '发送中…'}
                            </span>
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
                        )}
                      </div>
                    </PromptInputTools>
                    <PromptInputSubmit
                      status={
                        status === 'streaming' || pending
                          ? 'streaming'
                          : 'ready'
                      }
                      disabled={
                        !input.trim() || status === 'streaming' || pending
                      }
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
                      参考来源 ({sources.length} 个)
                    </span>
                  </div>
                  <ChevronDown className="h-3 w-3" />
                </SourcesTrigger>
                <Separator className="my-2 border-white/10" />
                <SourcesContent>
                  <ul className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                    {sources.map(source => {
                      const isExternal = source.sourceType === 'external';
                      return (
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
                          {isExternal && (
                            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-300">
                              网络搜索
                            </span>
                          )}
                          {!isExternal && (
                            <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-300">
                              本地资料
                            </span>
                          )}
                        </li>
                      );
                    })}
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
