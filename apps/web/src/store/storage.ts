import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * Persistence plumbing shared by every store.
 *
 * All persisted stores use `skipHydration: true` and are rehydrated explicitly
 * from `<StoreHydrator />` after mount. That is what keeps the server-rendered
 * HTML and the first client render byte-identical (no hydration warnings).
 */

export const STORAGE_KEYS = {
  auth: 'topchoice.auth',
  favorites: 'topchoice.favorites',
  compare: 'topchoice.compare',
  ui: 'topchoice.ui',
  chat: 'topchoice.chat',
} as const;

/** In-memory stand-in used during SSR, where `localStorage` does not exist. */
function createMemoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
  };
}

const memoryStorage = createMemoryStorage();

function resolveStorage(): StateStorage {
  if (typeof window === 'undefined') return memoryStorage;
  try {
    const probe = '__topchoice_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Safari private mode / storage disabled — degrade gracefully.
    return memoryStorage;
  }
}

/**
 * JSON storage that never throws during SSR or with storage disabled.
 *
 * Call it **without** a type argument: `persist` expects a
 * `PersistStorage<Partialized>`, and `partialize` usually narrows the state, so
 * letting `T` be inferred from that contextual type keeps the two in step.
 * Passing the full state type explicitly makes them disagree.
 */
export function persistedStorage<T>() {
  return createJSONStorage<T>(() => resolveStorage());
}
