// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_COMPARE_ITEMS } from '@/lib/constants';
import { useCompareStore, type CompareItem } from './compare.store';

const get = () => useCompareStore.getState();

function item(id: string): CompareItem {
  return { id, slug: `slug-${id}`, title: `Property ${id}`, price: 1_000_000 } as CompareItem;
}

beforeEach(() => {
  useCompareStore.setState({ items: [], hasHydrated: true });
});

describe('add', () => {
  it('accepts a new item', () => {
    expect(get().add(item('p1'))).toEqual({ ok: true });
    expect(get().items).toHaveLength(1);
  });

  it('refuses a duplicate and says why, rather than silently doing nothing', () => {
    get().add(item('p1'));

    expect(get().add(item('p1'))).toEqual({ ok: false, reason: 'duplicate' });
    expect(get().items).toHaveLength(1);
  });

  it(`refuses the ${MAX_COMPARE_ITEMS + 1}th item and says the tray is full`, () => {
    for (let i = 0; i < MAX_COMPARE_ITEMS; i += 1) get().add(item(`p${i}`));

    expect(get().isFull()).toBe(true);
    expect(get().add(item('one-too-many'))).toEqual({ ok: false, reason: 'full' });
    expect(get().items).toHaveLength(MAX_COMPARE_ITEMS);
  });

  it('is not full one below the cap', () => {
    for (let i = 0; i < MAX_COMPARE_ITEMS - 1; i += 1) get().add(item(`p${i}`));

    expect(get().isFull()).toBe(false);
  });
});

describe('remove, has and clear', () => {
  it('removes only the named item', () => {
    get().add(item('p1'));
    get().add(item('p2'));
    get().remove('p1');

    expect(get().items.map((i) => i.id)).toEqual(['p2']);
  });

  it('ignores a removal for something not in the tray', () => {
    get().add(item('p1'));
    get().remove('nope');

    expect(get().items).toHaveLength(1);
  });

  it('reports membership', () => {
    get().add(item('p1'));

    expect(get().has('p1')).toBe(true);
    expect(get().has('p2')).toBe(false);
  });

  it('empties the tray', () => {
    get().add(item('p1'));
    get().clear();

    expect(get().items).toEqual([]);
  });
});

describe('toggle', () => {
  it('adds when absent and reports that it added', () => {
    expect(get().toggle(item('p1'))).toMatchObject({ ok: true, added: true });
    expect(get().has('p1')).toBe(true);
  });

  it('removes when present and reports that it removed', () => {
    get().add(item('p1'));

    expect(get().toggle(item('p1'))).toMatchObject({ ok: true, added: false });
    expect(get().has('p1')).toBe(false);
  });

  it('fails with a reason when the tray is full and the item is new', () => {
    for (let i = 0; i < MAX_COMPARE_ITEMS; i += 1) get().add(item(`p${i}`));

    expect(get().toggle(item('new'))).toMatchObject({ ok: false, reason: 'full' });
  });

  it('can still remove an item while the tray is full', () => {
    for (let i = 0; i < MAX_COMPARE_ITEMS; i += 1) get().add(item(`p${i}`));

    expect(get().toggle(item('p0'))).toMatchObject({ ok: true, added: false });
    expect(get().items).toHaveLength(MAX_COMPARE_ITEMS - 1);
  });
});
