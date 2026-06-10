import { describe, expect, it } from 'vitest';
import { decodeLegacyToken } from './public-artifact-proxy';

describe('decodeLegacyToken', () => {
  it('decodes art_<base36> tokens to a content id', () => {
    expect(decodeLegacyToken('art_2u')).toBe(102);
  });

  it('round-trips the id encoding the client uses', () => {
    expect(decodeLegacyToken(`art_${(4138).toString(36)}`)).toBe(4138);
  });

  it('returns null for persisted (non-art) share-link tokens', () => {
    expect(decodeLegacyToken('Kx9fL2mQ7vR4tY8wZ1aB3cD6eF0gH5jN')).toBeNull();
  });

  it('returns null for malformed art tokens', () => {
    expect(decodeLegacyToken('art_!!!')).toBeNull();
    expect(decodeLegacyToken('art_')).toBeNull();
  });
});
