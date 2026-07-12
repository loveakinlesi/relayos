import { describe, it, expect, expectTypeOf } from 'vitest';
import type { GitHubEventMap } from './events';

// Type-level assertions: checked by tsc (the lint gate), not at runtime.

type Has<K extends string> = K extends keyof GitHubEventMap ? true : false;

describe('GitHubEventMap', () => {
  it('keys action-less events at the base name and action events per action', () => {
    expectTypeOf<Has<'github.push'>>().toEqualTypeOf<true>();
    expectTypeOf<Has<'github.pull_request.opened'>>().toEqualTypeOf<true>();
    expectTypeOf<Has<'github.issues.closed'>>().toEqualTypeOf<true>();
    // action-carrying events never fire under their bare name at runtime
    expectTypeOf<Has<'github.pull_request'>>().toEqualTypeOf<false>();
    expectTypeOf<Has<'github.not_a_real_event'>>().toEqualTypeOf<false>();
    expect(true).toBe(true);
  });

  it('types payloads per event and narrows action literals', () => {
    expectTypeOf<GitHubEventMap['github.push']>().toMatchTypeOf<{ ref: string }>();
    expectTypeOf<
      GitHubEventMap['github.pull_request.opened']['action']
    >().toEqualTypeOf<'opened'>();
    expectTypeOf<
      GitHubEventMap['github.pull_request.opened']['pull_request']['number']
    >().toEqualTypeOf<number>();
    expect(true).toBe(true);
  });
});
