'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

import { ChatPanel } from '@/components/chat/chat-panel';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useMounted } from '@/hooks/use-mounted';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat.store';

const NUDGE_DELAY_MS = 12_000;
const NUDGE_DISMISSED_KEY = 'topchoice_chat_nudge_dismissed';

/**
 * The customer-support agent, mounted globally from the root layout.
 *
 * Fixed to the bottom-right (bottom-left under RTL) with `z-[60]`, above the
 * page but below toasts. Full-screen on mobile, a floating card on desktop.
 */
export function ChatWidgetMount() {
  const mounted = useMounted();
  const isDesktop = useMediaQuery('(min-width: 640px)');

  const isOpen = useChatStore((state) => state.isOpen);
  const open = useChatStore((state) => state.open);
  const close = useChatStore((state) => state.close);
  const unreadCount = useChatStore((state) => state.unreadCount);

  const [showNudge, setShowNudge] = useState(false);

  // A single, dismissible prompt after a while of idling.
  useEffect(() => {
    if (!mounted || isOpen) return;

    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(NUDGE_DISMISSED_KEY) === '1';
    } catch {
      /* storage disabled */
    }
    if (dismissed) return;

    const timer = window.setTimeout(() => setShowNudge(true), NUDGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [mounted, isOpen]);

  const dismissNudge = () => {
    setShowNudge(false);
    try {
      window.localStorage.setItem(NUDGE_DISMISSED_KEY, '1');
    } catch {
      /* storage disabled */
    }
  };

  // Escape closes the panel.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // Rendering nothing until mounted keeps SSR and the client markup identical.
  if (!mounted) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 z-[60] flex flex-col items-end gap-3',
        // RTL-aware: `end` resolves to left when `dir="rtl"`.
        'end-4',
        isOpen && !isDesktop && 'inset-0 bottom-0 end-0 gap-0',
      )}
    >
      {isOpen ? (
        <div
          className={cn(
            'pointer-events-auto overflow-hidden',
            isDesktop
              ? 'h-[620px] max-h-[calc(100vh-6rem)] w-[400px]'
              : 'h-full w-full rounded-none',
          )}
          role="dialog"
          aria-modal={!isDesktop}
          aria-label="TopChoice Assistant"
        >
          <ChatPanel onClose={close} />
        </div>
      ) : (
        <>
          {showNudge && (
            <div className="pointer-events-auto flex max-w-[240px] items-start gap-2 rounded-2xl rounded-ee-sm border bg-card px-3.5 py-2.5 text-sm shadow-lg">
              <p className="flex-1">Need help finding a home? Ask me anything.</p>
              <button
                type="button"
                onClick={dismissNudge}
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              dismissNudge();
              open();
            }}
            aria-label="Open the TopChoice Assistant"
            className={cn(
              'pointer-events-auto relative grid size-14 place-items-center rounded-full',
              'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground',
              'shadow-lg transition-transform hover:scale-105 active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            <MessageCircle className="size-6" />

            {unreadCount > 0 && (
              <span className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-xs font-medium text-white">
                {unreadCount}
              </span>
            )}

            {/* Attention pulse, suppressed for reduced-motion users. */}
            <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-primary/30 motion-reduce:animate-none" />
          </button>
        </>
      )}
    </div>
  );
}
