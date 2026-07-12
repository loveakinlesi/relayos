import type { EventPayloadMap } from '@octokit/webhooks-types';

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never;

/**
 * One map fragment per GitHub event: action-carrying events get one key per
 * action ("github.pull_request.opened" -> the opened payload), events
 * without an action get a single base key ("github.push"). This mirrors
 * exactly how the github plugin's normalize() names event types at runtime -
 * a pull_request delivery always carries an action, so there is deliberately
 * no bare "github.pull_request" key.
 */
type EventEntries<K extends keyof EventPayloadMap & string> = EventPayloadMap[K] extends {
  action: string;
}
  ? {
      [A in EventPayloadMap[K]['action'] as `github.${K}.${A}`]: Extract<
        EventPayloadMap[K],
        { action: A }
      >;
    }
  : { [P in `github.${K}`]: EventPayloadMap[K] };

export type GitHubEventMap =
  UnionToIntersection<
    { [K in keyof EventPayloadMap & string]: EventEntries<K> }[keyof EventPayloadMap & string]
  > extends infer TMap
    ? { [K in keyof TMap]: TMap[K] }
    : never;
