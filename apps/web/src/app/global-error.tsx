'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary: replaces the whole document when the root layout itself
 * throws, so it must render its own <html>/<body> and cannot rely on providers,
 * fonts or the design-system CSS being available.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[nawy:web] global error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="en" dir="ltr">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          color: '#0f172a',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div style={{ maxWidth: '32rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem' }}>
            Nawy is temporarily unavailable
          </h1>
          <p style={{ margin: '0 0 1.5rem', color: '#475569', lineHeight: 1.6 }}>
            The application failed to start. Please reload the page in a moment.
          </p>
          {error.digest ? (
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: 'pointer',
              borderRadius: '0.5rem',
              border: 'none',
              backgroundColor: '#0075b0',
              color: '#ffffff',
              padding: '0.625rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
