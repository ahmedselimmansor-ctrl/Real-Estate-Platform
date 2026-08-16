import type { Nullable } from './common';

/** rag-svc `/api/chat` surface (CONTRACT §6). Stage 3 wires the widget to it. */

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatSource {
  id: string;
  title: string;
  url?: string;
  snippet?: string;
  score?: number;
  /** Present when the citation resolves to a listing. */
  propertyId?: string;
  slug?: string;
  kind?: 'property' | 'compound' | 'faq' | 'web' | 'area' | 'developer';
}

export interface ChatToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  startedAt?: string;
  finishedAt?: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: ChatRole;
  content: string;
  sources?: ChatSource[];
  toolCalls?: ChatToolCall[];
  createdAt: string;
  /** Local-only flag while an assistant reply is still streaming. */
  isStreaming?: boolean;
  error?: Nullable<string>;
  rating?: Nullable<1 | -1>;
}

export interface ChatThread {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SendMessagePayload {
  threadId?: string;
  message: string;
  stream?: boolean;
}

export interface ChatFeedbackPayload {
  messageId: string;
  rating: 1 | -1;
  comment?: string;
}

/** SSE event names emitted by rag-svc (CONTRACT §6). */
export type ChatStreamEvent = 'token' | 'tool_start' | 'tool_end' | 'sources' | 'done' | 'error';
