import { describe, expect, it } from 'vitest';
import { relayos } from './index';

describe('relayos', () => {
  it('returns an object without throwing', () => {
    expect(() => relayos()).not.toThrow();
    expect(relayos()).toBeTypeOf('object');
  });

  it('returns an object when called with an empty options object', () => {
    expect(() => relayos({})).not.toThrow();
    expect(relayos({})).toBeTypeOf('object');
  });

  it('returns a non-null value', () => {
    expect(relayos()).not.toBeNull();
  });
});
