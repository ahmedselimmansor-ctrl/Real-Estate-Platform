'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowDown,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Home,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchThreadMessages,
  sendFeedback,
  streamMessage,
  type ChatDonePayload,
} from '@/lib/chat-client';
import { formatCompactEGP } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cn, uuid } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { useUiStore } from '@/store/ui.store';
import type { ChatMessage, ChatSource } from '@/types/chat';

const SUGGESTIONS = [
  'What payment plans are available in New Cairo?',
  'Show me 3-bedroom villas under 15M EGP',
  'How does the resale process work?',
  'What fees do I pay when buying?',
];

const TOOL_LABELS: Record<string, string> = {
  web_search: '🔎 Searching the web…',
  search_listings: '🏠 Searching listings…',
  get_property_details: '📄 Reading the listing…',
  calculate_mortgage: '🧮 Running the numbers…',
  create_lead: '📞 Arranging a callback…',
  escalate_to_human: '🙋 Finding a consultant…',
};

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const locale = useUiStore((state) => state.locale);
  const accessToken = useAuthStore((state) => state.accessToken);

  const {
    threadId,
    messages,
    isStreaming,
    input,
    error,
    setThreadId,
    setMessages,
    appendMessage,
    startAssistantMessage,
    appendToken,
    finishAssistantMessage,
    setSources,
    startToolCall,
    endToolCall,
    setStreaming,
    setInput,
    setError,
    rateMessage,
    resetThread,
  } = useChatStore();

  const [activeTool, setActiveTool] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  // --- restore a prior conversation ----------------------------------------
  useEffect(() => {
    if (!threadId || messages.length > 0) return;

    void fetchThreadMessages(threadId, accessToken).then((history) => {
      if (history.length > 0) setMessages(history);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // --- autoscroll, unless the user has scrolled up --------------------------
  useEffect(() => {
    if (pinnedToBottom) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, pinnedToBottom]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    setPinnedToBottom(distance < 80);
  };

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setActiveTool(null);
  }, [setStreaming]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || isStreaming) return;

      setError(null);
      setInput('');
      setPinnedToBottom(true);

      const localThreadId = threadId ?? 'pending';
      appendMessage({
        id: uuid(),
        threadId: localThreadId,
        role: 'user',
        content: question,
        createdAt: new Date().toISOString(),
      });

      const assistantId = startAssistantMessage(localThreadId);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamMessage(
          { message: question, threadId, accessToken, signal: controller.signal, locale },
          {
            onToken: (token) => appendToken(assistantId, token),
            onSources: (sources) => setSources(sources, assistantId),
            onToolStart: (payload) => {
              const name = payload.name ?? payload.route ?? 'tool';
              setActiveTool(name);
              startToolCall({ id: name, name, status: 'running' });
            },
            onToolEnd: (payload) => {
              setActiveTool(null);
              endToolCall(payload.name ?? 'tool', {
                status: payload.ok === false ? 'error' : 'done',
              });
            },
            onDone: (payload: ChatDonePayload) => {
              if (payload.threadId) setThreadId(payload.threadId);
              finishAssistantMessage(assistantId, {
                id: payload.messageId ?? assistantId,
                threadId: payload.threadId,
                sources: payload.sources,
              });
            },
            onError: (failure) => {
              setError(failure.message);
              finishAssistantMessage(assistantId, { error: failure.message });
            },
          },
        );
      } catch (failure) {
        if ((failure as Error).name !== 'AbortError') {
          const message =
            failure instanceof Error ? failure.message : 'The assistant is unreachable.';
          setError(message);
          finishAssistantMessage(assistantId, { error: message });
        }
      } finally {
        setStreaming(false);
        setActiveTool(null);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threadId, accessToken, isStreaming, locale],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
      {/* ------------------------------------------------------------ header */}
      <header className="flex items-center gap-3 border-b bg-gradient-to-r from-primary/10 to-transparent px-4 py-3">
        <div className="relative">
          <div className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <span className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-card bg-emerald-500" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Nawy Assistant</p>
          <p className="text-xs text-muted-foreground">
            {isStreaming ? 'Typing…' : 'Online, usually replies instantly'}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => {
            stop();
            resetThread();
          }}
          aria-label="Start a new chat"
          title="New chat"
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onClose}
          aria-label="Close chat"
        >
          <X className="size-4" />
        </Button>
      </header>

      {/* ---------------------------------------------------------- messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="relative flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {isEmpty ? (
          <div className="space-y-4 py-6">
            <div className="space-y-1.5 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10">
                <Sparkles className="size-5 text-primary" />
              </div>
              <p className="text-sm font-medium">How can I help you find a home?</p>
              <p className="text-xs text-muted-foreground">
                Ask about listings, compounds, payment plans or the buying process.
              </p>
            </div>

            <div className="space-y-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="w-full rounded-xl border px-3 py-2.5 text-start text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onRate={async (rating) => {
                rateMessage(message.id, rating);
                const ok = await sendFeedback(message.id, rating, undefined, accessToken);
                toast[ok ? 'success' : 'error'](
                  ok ? 'Thanks for the feedback' : 'Could not record that',
                );
              }}
            />
          ))
        )}

        {activeTool && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {TOOL_LABELS[activeTool] ?? 'Working…'}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="text-destructive">{error}</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                  if (lastUser) void send(lastUser.content);
                }}
              >
                Try again
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href={routes.contact}>Contact us</Link>
              </Button>
            </div>
          </div>
        )}
      </div>

      {!pinnedToBottom && (
        <button
          type="button"
          onClick={() => {
            setPinnedToBottom(true);
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: 'smooth',
            });
          }}
          className="absolute bottom-24 start-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs shadow-md"
        >
          <ArrowDown className="size-3" />
          Jump to latest
        </button>
      )}

      {/* --------------------------------------------------------- composer */}
      <form
        className="border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask about a property, area or payment plan…"
            rows={1}
            maxLength={4000}
            aria-label="Message"
            className="max-h-32 min-h-11 flex-1 resize-none py-2.5"
          />

          {isStreaming ? (
            <Button type="button" size="icon" variant="outline" onClick={stop} aria-label="Stop">
              <Square className="size-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          )}
        </div>

        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          Answers are indicative, confirm details with a Nawy consultant.
        </p>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function MessageBubble({
  message,
  onRate,
}: {
  message: ChatMessage;
  onRate: (rating: 1 | -1) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-ee-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="max-w-[92%] rounded-2xl rounded-es-sm bg-muted px-3.5 py-2.5 text-sm">
        {message.content ? (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-ul:my-1.5 prose-headings:mt-2 prose-headings:text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer" className="underline">
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto">
                    <table>{children}</table>
                  </div>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        ) : message.isStreaming ? (
          <TypingDots />
        ) : null}
      </div>

      {message.sources && message.sources.length > 0 && (
        <SourcesPanel sources={message.sources} />
      )}

      {!message.isStreaming && message.content && (
        <div className="flex items-center gap-1 ps-1">
          <IconButton label="Copy" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </IconButton>
          <IconButton
            label="Helpful"
            active={message.rating === 1}
            onClick={() => onRate(1)}
          >
            <ThumbsUp className="size-3.5" />
          </IconButton>
          <IconButton
            label="Not helpful"
            active={message.rating === -1}
            onClick={() => onRate(-1)}
          >
            <ThumbsDown className="size-3.5" />
          </IconButton>
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'grid size-7 place-items-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground',
        active && 'bg-primary/10 text-primary',
      )}
    >
      {children}
    </button>
  );
}

function SourcesPanel({ sources }: { sources: ChatSource[] }) {
  const [open, setOpen] = useState(false);
  const visible = open ? sources : sources.slice(0, 2);

  return (
    <div className="space-y-1.5">
      <p className="ps-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Sources
      </p>

      <ul className="space-y-1.5">
        {visible.map((source, index) => (
          <li key={`${source.id ?? source.url ?? index}`}>
            <SourceCard source={source} index={index + 1} />
          </li>
        ))}
      </ul>

      {sources.length > 2 && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="ps-1 text-[11px] text-primary hover:underline"
        >
          {open ? 'Show fewer' : `Show ${sources.length - 2} more`}
        </button>
      )}
    </div>
  );
}

function SourceCard({ source, index }: { source: ChatSource; index: number }) {
  const kind = source.kind ?? (source.slug ? 'property' : 'faq');
  const record = source as ChatSource & { price?: number; image?: string; domain?: string };

  if (kind === 'property' && source.slug) {
    return (
      <Link
        href={routes.property(source.slug)}
        className="flex items-center gap-2.5 rounded-lg border p-2 transition-colors hover:border-primary/40 hover:bg-primary/5"
      >
        {record.image ? (
          <Image
            src={record.image}
            alt=""
            width={48}
            height={36}
            className="size-9 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="grid size-9 shrink-0 place-items-center rounded bg-muted">
            <Home className="size-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            [{index}] {source.title}
          </p>
          {record.price ? (
            <p className="text-[11px] text-muted-foreground">{formatCompactEGP(record.price)}</p>
          ) : null}
        </div>
      </Link>
    );
  }

  if (kind === 'web' && source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-start gap-2 rounded-lg border p-2 transition-colors hover:border-primary/40"
      >
        <Globe className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            [{index}] {source.title}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{record.domain}</p>
        </div>
        <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      </a>
    );
  }

  return (
    <div className="rounded-lg border p-2">
      <p className="text-xs font-medium">
        [{index}] {source.title}
      </p>
      {source.snippet && (
        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{source.snippet}</p>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Assistant is typing">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

export { Badge };
