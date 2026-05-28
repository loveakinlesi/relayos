import { describe, expect, it } from 'vitest';
import { VERSION, createRelayCore } from './index';

describe('VERSION', () => {
  it('is a valid semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('createRelayCore', () => {
  it('can be called without arguments', () => {
    expect(() => createRelayCore()).not.toThrow();
  });

  it('can be called with an empty options object', () => {
    expect(() => createRelayCore({})).not.toThrow();
  });
});
