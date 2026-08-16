'use client';

import { useEffect, useState } from 'react';

/**
 * `false` during SSR and the first client render, `true` afterwards.
 * Gate any client-only markup (persisted counts, theme icons) behind this so
 * the server HTML and first client render stay identical.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
