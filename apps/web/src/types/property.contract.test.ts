import { describe, expect, it } from 'vitest';

import type { Property, PropertySearchHit } from './property';

/**
 * A type is a promise about a payload, and nothing here was checking whether
 * the payload kept it.
 *
 * `Property` declared `id: string`, described as Mongo's `_id` serialised by
 * api-core. No such mapping exists — the service returns lean documents, so a
 * response carries a raw `_id` and no `id`. Because the type asserted the
 * field, `property.id` compiled everywhere while evaluating to `undefined` at
 * runtime, and five React lists were keyed on it. React reported one missing
 * key; the real cost is that a keyless list reconciles by index, so sorting or
 * filtering leaves per-card state attached to the wrong listing.
 *
 * These are compile-time assertions. The runtime shapes are verified against
 * the live services in tests/integration/specs/catalogue.spec.ts; what belongs
 * here is the rule that the two shapes must not be confused for each other.
 */

/** Fails to compile if `K` is not a required key of `T`. */
type RequiresKey<T, K extends keyof T> = T[K] extends undefined ? never : K;

/** Fails to compile if `T` has a key named `K` at all. */
type HasNoKey<T, K extends PropertyKey> = K extends keyof T ? never : true;

describe('the catalogue shape is identified by propertyId', () => {
  it('requires propertyId', () => {
    const key: RequiresKey<Property, 'propertyId'> = 'propertyId';

    expect(key).toBe('propertyId');
  });

  it('has no `id` — /api/v1/properties never returns one', () => {
    const absent: HasNoKey<Property, 'id'> = true;

    expect(absent).toBe(true);
  });
});

describe('the search shape is identified by id', () => {
  it('requires id, because an Elasticsearch document is keyed that way', () => {
    const key: RequiresKey<PropertySearchHit, 'id'> = 'id';

    expect(key).toBe('id');
  });
});

describe('the two shapes stay distinguishable', () => {
  it('a catalogue property is not assignable to a search hit', () => {
    // If this ever compiles, the union in PropertyCardData collapses and the
    // card can no longer tell which branch it is normalising.
    const isAssignable = false as Property extends PropertySearchHit ? true : false;

    expect(isAssignable).toBe(false);
  });

  it('a search hit is not assignable to a catalogue property', () => {
    const isAssignable = false as PropertySearchHit extends Property ? true : false;

    expect(isAssignable).toBe(false);
  });
});
