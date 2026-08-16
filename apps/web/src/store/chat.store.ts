'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { uuid } from '@/lib/utils';
import type { ChatMessage, ChatSource, ChatToolCall } from '@/types/chat';
import { persistedStorage, STORAGE_KEYS } from './storage';

/**
 * Chat widget state (CONTRACT §8). Stage 3 wires this to the rag-svc SSE
 * stream (`token` / `tool_start` / `tool_end` / `sources` / `done` / `error`);
 * every mutation those events need already lives here.
 *
 * Only `threadId` is persisted — transcripts are re-fetched from
 * `GET /api/chat/threads/:id/messages` so the store never goes stale.
 */

export interface ChatState {
  threadId: string | null;
  messages: ChatMessage[];
  sources: ChatSource[];
  toolCalls: ChatToolCall[];
  isOpen: boolean;
  isStreaming: boolean;
  /** Id of the assistant message currently receiving tokens. */
  streamingMessageId: string | null;
  input: string;
  error: string | null;
  unreadCount: number;
  hasHydrated: boolean;

  setThreadId: (threadId: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  appendMessage: (message: ChatMessage) => void;
  /** Creates the placeholder assistant message and returns its id. */
  startAssistantMessage: (threadId: string) => string;
  appendToken: (messageId: string, token: string) => void;
  finishAssistantMessage: (messageId: string, patch?: Partial<ChatMessage>) => void;
  setSources: (sources: ChatSource[], messageId?: string) => void;
  startToolCall: (toolCall: ChatToolCall) => void;
  endToolCall: (id: string, patch?: Partial<ChatToolCall>) => void;
  setStreaming: (isStreaming: boolean) => void;
  setInput: (input: string) => void;
  setError: (error: string | null) => void;
  rateMessage: (messageId: string, rating: 1 | -1) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  markRead: () => void;
  resetThread: () => void;
  hydrate: () => Promise<void>;
  setHasHydrated: (value: boolean) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      threadId: null,
      messages: [],
      sources: [],
      toolCalls: [],
      isOpen: false,
      isStreaming: false,
      streamingMessageId: null,
      input: '',
      error: null,
      unreadCount: 0,
      hasHydrated: false,

      setThreadId: (threadId) => set({ threadId }),

      setMessages: (messages) => set({ messages }),

      appendMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
          unreadCount:
            message.role === 'assistant' && !state.isOpen ? state.unreadCount + 1 : state.unreadCount,
        })),

      startAssistantMessage: (threadId) => {
        const id = uuid();
        const message: ChatMessage = {
          id,
          threadId,
          role: 'assistant',
          content: '',
          sources: [],
          toolCalls: [],
          createdAt: new Date().toISOString(),
          isStreaming: true,
        };
        set((state) => ({
          messages: [...state.messages, message],
          streamingMessageId: id,
          isStreaming: true,
          error: null,
        }));
        return id;
      },

      appendToken: (messageId, token) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === messageId ? { ...message, content: message.content + token } : message,
          ),
        })),

      finishAssistantMessage: (messageId, patch) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === messageId
              ? { ...message, ...patch, isStreaming: false }
              : message,
          ),
          isStreaming: false,
          streamingMessageId: null,
          unreadCount: state.isOpen ? state.unreadCount : state.unreadCount + 1,
        })),

      setSources: (sources, messageId) =>
        set((state) => ({
          sources,
          messages: messageId
            ? state.messages.map((message) =>
                message.id === messageId ? { ...message, sources } : message,
              )
            : state.messages,
        })),

      startToolCall: (toolCall) =>
        set((state) => ({ toolCalls: [...state.toolCalls, { ...toolCall, status: 'running' }] })),

      endToolCall: (id, patch) =>
        set((state) => ({
          toolCalls: state.toolCalls.map((call) =>
            call.id === id ? { ...call, status: 'done', ...patch } : call,
          ),
        })),

      setStreaming: (isStreaming) => set({ isStreaming }),

      setInput: (input) => set({ input }),

      setError: (error) => set({ error, isStreaming: false, streamingMessageId: null }),

      rateMessage: (messageId, rating) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === messageId ? { ...message, rating } : message,
          ),
        })),

      open: () => set({ isOpen: true, unreadCount: 0 }),
      close: () => set({ isOpen: false }),
      toggle: () =>
        set((state) => ({ isOpen: !state.isOpen, unreadCount: state.isOpen ? state.unreadCount : 0 })),
      markRead: () => set({ unreadCount: 0 }),

      resetThread: () =>
        set({
          threadId: null,
          messages: [],
          sources: [],
          toolCalls: [],
          isStreaming: false,
          streamingMessageId: null,
          error: null,
          input: '',
        }),

      hydrate: async () => {
        await useChatStore.persist.rehydrate();
        if (!get().hasHydrated) set({ hasHydrated: true });
      },

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: STORAGE_KEYS.chat,
      version: 1,
      storage: persistedStorage(),
      skipHydration: true,
      partialize: (state) => ({ threadId: state.threadId }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/* ------------------------------------------------------------- selectors -- */

export const useChatOpen = () => useChatStore((state) => state.isOpen);
export const useChatMessages = () => useChatStore((state) => state.messages);
export const useChatStreaming = () => useChatStore((state) => state.isStreaming);
export const useChatSources = () => useChatStore((state) => state.sources);
export const useChatUnread = () => useChatStore((state) => state.unreadCount);

export const useChatActions = () =>
  useChatStore(
    useShallow((state) => ({
      open: state.open,
      close: state.close,
      toggle: state.toggle,
      setInput: state.setInput,
      appendMessage: state.appendMessage,
      startAssistantMessage: state.startAssistantMessage,
      appendToken: state.appendToken,
      finishAssistantMessage: state.finishAssistantMessage,
      setSources: state.setSources,
      startToolCall: state.startToolCall,
      endToolCall: state.endToolCall,
      setStreaming: state.setStreaming,
      setError: state.setError,
      setThreadId: state.setThreadId,
      resetThread: state.resetThread,
      rateMessage: state.rateMessage,
    })),
  );
