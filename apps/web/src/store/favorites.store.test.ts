// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { useFavoritesStore } from './favorites.store';
import { useAuthStore } from './auth.store';

/**
 * Every mutation here is optimistic: the id moves in the UI before the server
 * has agreed. That is only safe if the rollback is right, so most of these
 * assert what happens when the server says no.
 */

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('@/lib/api');
  return {
    ...actual,
    api: {
      post: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    },
  };
});

const { api } = await import('@/lib/api');
const post = api.post as ReturnType<typeof vi.fn>;
const del = api.delete as ReturnType<typeof vi.fn>;
const list = api.list as ReturnType<typeof vi.fn>;

function signIn() {
  useAuthStore.setState({ status: 'authenticated', accessToken: 't', user: { id: 'u1' } as never });
}

function signOut() {
  useAuthStore.setState({ status: 'unauthenticated', accessToken: null, user: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  useFavoritesStore.setState({ ids: [], pending: {}, lastSyncedAt: null, hasHydrated: true });
  signOut();
});

describe('add', () => {
  it('inserts the id immediately, before the server has answered', async () => {
    signIn();
    let resolvePost: (v?: unknown) => void = () => {};
    post.mockReturnValueOnce(new Promise((r) => { resolvePost = r; }));

    const inFlight = useFavoritesStore.getState().add('p1');

    // Optimistic: already saved in the UI while the request is open.
    expect(useFavoritesStore.getState().ids).toEqual(['p1']);
    expect(useFavoritesStore.getState().pending.p1).toBe(true);

    resolvePost();
    await inFlight;
    expect(useFavoritesStore.getState().pending.p1).toBeUndefined();
  });

  it('puts the newest save at the front', async () => {
    signIn();
    post.mockResolvedValue(undefined);

    await useFavoritesStore.getState().add('p1');
    await useFavoritesStore.getState().add('p2');

    expect(useFavoritesStore.getState().ids).toEqual(['p2', 'p1']);
  });

  it('rolls the id back out when the server rejects it', async () => {
    signIn();
    post.mockRejectedValueOnce(new ApiError({ code: 'INTERNAL_ERROR', message: 'boom', status: 500 }));

    await expect(useFavoritesStore.getState().add('p1')).resolves.toBe(false);
    expect(useFavoritesStore.getState().ids).toEqual([]);
    expect(useFavoritesStore.getState().pending.p1).toBeUndefined();
  });

  it('keeps the id on a 409 — already saved server-side is success, not failure', async () => {
    signIn();
    post.mockRejectedValueOnce(new ApiError({ code: 'CONFLICT', message: 'already', status: 409 }));

    await expect(useFavoritesStore.getState().add('p1')).resolves.toBe(true);
    expect(useFavoritesStore.getState().ids).toEqual(['p1']);
  });

  it('is a no-op for an id already saved', async () => {
    signIn();
    useFavoritesStore.setState({ ids: ['p1'] });

    await expect(useFavoritesStore.getState().add('p1')).resolves.toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it('saves locally without calling the API when signed out', async () => {
    await expect(useFavoritesStore.getState().add('p1')).resolves.toBe(true);

    expect(post).not.toHaveBeenCalled();
    expect(useFavoritesStore.getState().ids).toEqual(['p1']);
    expect(useFavoritesStore.getState().pending.p1).toBeUndefined();
  });
});

describe('remove', () => {
  it('drops the id immediately and clears pending on success', async () => {
    signIn();
    useFavoritesStore.setState({ ids: ['p1', 'p2'] });
    del.mockResolvedValueOnce(undefined);

    await expect(useFavoritesStore.getState().remove('p1')).resolves.toBe(true);
    expect(useFavoritesStore.getState().ids).toEqual(['p2']);
  });

  it('restores the full previous list when the server rejects the delete', async () => {
    signIn();
    useFavoritesStore.setState({ ids: ['p1', 'p2', 'p3'] });
    del.mockRejectedValueOnce(new ApiError({ code: 'INTERNAL_ERROR', message: 'boom', status: 500 }));

    await expect(useFavoritesStore.getState().remove('p2')).resolves.toBe(false);
    // Order matters — the rollback restores the snapshot, not a reconstruction.
    expect(useFavoritesStore.getState().ids).toEqual(['p1', 'p2', 'p3']);
  });

  it('accepts a 404 — gone server-side is the outcome we wanted', async () => {
    signIn();
    useFavoritesStore.setState({ ids: ['p1', 'p2'] });
    del.mockRejectedValueOnce(new ApiError({ code: 'NOT_FOUND', message: 'gone', status: 404 }));

    await expect(useFavoritesStore.getState().remove('p1')).resolves.toBe(true);
    expect(useFavoritesStore.getState().ids).toEqual(['p2']);
  });

  it('is a no-op for an id that was never saved', async () => {
    signIn();

    await expect(useFavoritesStore.getState().remove('nope')).resolves.toBe(true);
    expect(del).not.toHaveBeenCalled();
  });
});

describe('toggle', () => {
  it('adds when absent and reports the new state', async () => {
    signIn();
    post.mockResolvedValueOnce(undefined);

    await expect(useFavoritesStore.getState().toggle('p1')).resolves.toBe(true);
    expect(useFavoritesStore.getState().ids).toContain('p1');
  });

  it('removes when present and reports the new state', async () => {
    signIn();
    useFavoritesStore.setState({ ids: ['p1'] });
    del.mockResolvedValueOnce(undefined);

    await expect(useFavoritesStore.getState().toggle('p1')).resolves.toBe(false);
    expect(useFavoritesStore.getState().ids).not.toContain('p1');
  });
});

describe('isFavorite, setAll and clear', () => {
  it('reports membership', () => {
    useFavoritesStore.setState({ ids: ['p1'] });

    expect(useFavoritesStore.getState().isFavorite('p1')).toBe(true);
    expect(useFavoritesStore.getState().isFavorite('p2')).toBe(false);
  });

  it('dedupes on setAll', () => {
    useFavoritesStore.getState().setAll(['p1', 'p2', 'p1']);

    expect(useFavoritesStore.getState().ids).toEqual(['p1', 'p2']);
  });

  it('clear wipes ids, pending and the sync watermark', () => {
    useFavoritesStore.setState({ ids: ['p1'], pending: { p1: true }, lastSyncedAt: 123 });
    useFavoritesStore.getState().clear();

    expect(useFavoritesStore.getState()).toMatchObject({ ids: [], pending: {}, lastSyncedAt: null });
  });
});

describe('syncWithServer', () => {
  it('does nothing at all when signed out', async () => {
    await useFavoritesStore.getState().syncWithServer();

    expect(list).not.toHaveBeenCalled();
  });

  it('merges the server list with guest-era saves and pushes the missing ones up', async () => {
    signIn();
    useFavoritesStore.setState({ ids: ['guest-1'] });
    list.mockResolvedValueOnce({ items: [{ propertyId: 'server-1' }, { propertyId: 'server-2' }] });
    post.mockResolvedValue(undefined);

    await useFavoritesStore.getState().syncWithServer();

    expect(useFavoritesStore.getState().ids).toEqual(['server-1', 'server-2', 'guest-1']);
    // The guest-era save is pushed to the account; the server's own are not re-posted.
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/favorites/guest-1');
  });

  it('records when the sync happened', async () => {
    signIn();
    list.mockResolvedValueOnce({ items: [] });

    await useFavoritesStore.getState().syncWithServer();

    expect(useFavoritesStore.getState().lastSyncedAt).toBeTypeOf('number');
  });

  it('keeps the local list when the server is unreachable', async () => {
    signIn();
    useFavoritesStore.setState({ ids: ['local-1'] });
    list.mockRejectedValueOnce(new ApiError({ code: 'NETWORK_ERROR', message: 'offline', status: 0 }));

    await expect(useFavoritesStore.getState().syncWithServer()).resolves.toBeUndefined();
    expect(useFavoritesStore.getState().ids).toEqual(['local-1']);
    expect(useFavoritesStore.getState().lastSyncedAt).toBeNull();
  });

  it('still completes when an individual push fails', async () => {
    signIn();
    useFavoritesStore.setState({ ids: ['guest-1', 'guest-2'] });
    list.mockResolvedValueOnce({ items: [] });
    post
      .mockRejectedValueOnce(new ApiError({ code: 'INTERNAL_ERROR', message: 'boom', status: 500 }))
      .mockResolvedValueOnce(undefined);

    await expect(useFavoritesStore.getState().syncWithServer()).resolves.toBeUndefined();
    expect(useFavoritesStore.getState().ids).toEqual(['guest-1', 'guest-2']);
  });
});
