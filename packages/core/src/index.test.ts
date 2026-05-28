import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('VERSION', () => {
  it('is a valid semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
