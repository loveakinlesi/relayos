# Framework naming research

RelayOS is a durable webhook execution platform (durable steps, retries, replay, audit
trail — see the root `README.md`). This document records a full pass at finding an
alternative short name for the framework/package, in case `relayos` needs to change.

## Method

1. **Generate 300+ candidates.** Built a pool of ≤6-letter words themed around the
   product's core concepts — relaying, durability, retries, replay, weaving/joining
   events, signals — mixing real dictionary words (`fuse`, `rivet`, `ledger`, `resume`)
   with invented brandable blends (`rewynd`, `steadi`, `loomi`). Final pool: **342
   unique candidates**, all ≤6 letters. (Generation script: `scripts` below are not
   committed — this doc captures the results.)
2. **Score for pronunciation / spelling / branding.** Each candidate was scored on:
   - **Pronounceability** — vowel/consonant alternation, no illegal 4+ consonant or
     vowel runs.
   - **Spelling simplicity** — penalized ambiguous clusters (`ph`, `gh`, `kn`, `wr`,
     double letters, multiple `y`s).
   - **Branding fit** — length sweet spot (4–5 letters best), clean vowel endings,
     penalty for names that are already extremely overloaded generic dev-tool words
     (`loop`, `flow`, `queue`, `cache`, `spring`, `router`, `switch`, etc.).
3. **Narrow to top 25 for verification.** The naive top-scoring list skewed toward
   common English words (`fuse`, `gate`, `wave`, `pipe`, `rely`, `redo`, `resume`,
   `ledger`...). Before verifying, every one of those was checked against npm —
   **all 342 candidates** were checked, and only **51 of 342 (15%)** were actually
   unregistered on npm. Every plain dictionary word in the pool was already taken.
   The top 25 for full verification were therefore drawn from that 51-name
   npm-available shortlist, re-ranked by the same pronunciation/spelling/branding
   score and by thematic fit to webhooks/durability/replay.
4. **Verify the top 25** against four live checks:
   - **npm**: `GET https://registry.npmjs.org/<name>` (404 = available).
   - **GitHub org/user**: GitHub's user search API, queried both as
     `<name> type:org` and `<name> type:user` and checked for an exact
     case-insensitive login match (GitHub's org and user namespaces are shared —
     a taken username blocks the same org name). *Caveat: this is a search-relevance
     API, not a direct existence lookup, so a handful of matches on later result pages
     could in theory be missed; exact-login hits on page one were treated as
     confirmed-taken.*
   - **`.dev` / `.sh` domains**: live availability + pricing via registrar lookup.

## Results: top 25, fully verified

All 25 below already passed npm (that's how they were selected). GitHub and domain
results:

| Name | npm | GitHub org/user | `.dev` | `.sh` | All 4 clear? |
|---|---|---|---|---|---|
| **rewir** | available | **available** | available ($9.99) | available ($22) | **✅ YES** |
| **weftr** | available | **available** | available ($9.99) | available ($22) | **✅ YES** |
| cronly | available | available | taken | taken | ❌ (domains) |
| stepr | available | taken (user `StepR`) | available | available | ❌ |
| trigr | available | taken (org `Trigr`) | taken | taken | ❌ |
| repla | available | taken (user `repla`) | taken | available | ❌ |
| rewynd | available | taken (org `rewynd`) | available | available | ❌ |
| revyv | available | taken (org `revyv`) | available | available | ❌ |
| relok | available | taken (user `relok`) | available | available | ❌ |
| latcho | available | taken (user `latcho`) | available | available | ❌ |
| steadi | available | taken (user `Steadi`) | available | available | ❌ |
| loomi | available | taken (org `loomi`) | taken | available | ❌ |
| wynch | available | taken (user `wynch`) | available | available | ❌ |
| meshr | available | taken (user `meshr`) | taken | available | ❌ |
| relio | available | taken (user `relio`) | taken | available | ❌ |
| rezio | available | taken (`REzio`) | available | available | ❌ |
| echor | available | taken (user `echor`) | available | available | ❌ |
| rylay | available | taken (user `rylay`) | available | available | ❌ |
| flaro | available | taken (user `flaro`) | taken | available | ❌ |
| furio | available | taken (user `furio`) | taken | available | ❌ |
| kelio | available | taken (user `kelio`) | available | available | ❌ |
| nomly | available | taken (user `nomly`) | available | available | ❌ |
| runlo | available | taken (user `Runlo`) | available | available | ❌ |
| emberi | available | taken (user `emberi`) | available | available | ❌ |
| thryv | available | taken (user `thryv`) | taken | available | ❌ |

**Only two candidates clear all four checks simultaneously: `rewir` and `weftr`.**

This is the headline finding, not a footnote: npm has ~3M packages and GitHub has
~100M+ accounts, so almost every short, easily-pronounceable English word or
near-word is already squatted somewhere. Of 342 generated candidates, 85% were
already gone on npm alone; of the 25 survivors that also read well, 92% were then
blocked by GitHub's shared user/org namespace. A fully-clear ≤6-letter name across
npm + GitHub + two domains is genuinely rare.

## Recommendation

**`rewir`** — stylized "rewire" (missing the final *e*). Reads cleanly, everyone
recognizes the root word, and "rewiring" a broken connection is a direct, intuitive
metaphor for durable execution: a failed step gets rewired/reconnected on retry
instead of the whole flow rebuilding from scratch. Clears npm, GitHub, `rewir.dev`,
and `rewir.sh`.

Runner-up: **`weftr`** — from "weft" (the threads woven crosswise through a loom's
"warp"), evoking events being woven together into durable executions. Equally clear
on all four checks, but "weft" is a more obscure word than "wire," so it needs more
explaining the first time someone hears it.

### Caveats before committing to either

- The GitHub check is a relevance search, not a direct `GET /users/<login>` lookup
  (that endpoint isn't reachable from this environment) — worth a final manual
  confirmation of `github.com/rewir` and `github.com/weftr` before registering.
- Neither name was checked against `.com`/`.io` or existing trademarks — only the
  four checks the task asked for (npm, GitHub org, `.dev`, `.sh`).
- RelayOS already publishes scoped packages (`@relayos/core`, `@relayos/stripe`,
  etc.) alongside the unscoped `relayos` package. If the unscoped top-level name is
  the only blocker, scoping under a new org (`@rewir/core`, `@weftr/core`) sidesteps
  npm's unscoped-name scarcity entirely and was not required by this exercise's
  criteria but is worth keeping in mind.
