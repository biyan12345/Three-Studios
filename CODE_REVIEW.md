# Streamplay Studio Code Review

Date: 2026-08-09  
Scope: Full read-only pass focused on runtime bottlenecks, scoring correctness, session persistence, allocation auditing, timers, TikTok gift ingestion, OBS overlays, and maintainability.

## Executive summary

The project currently passes its type and production-build checks, but several runtime design issues can cause score divergence, lost session history, repeated overlay requests, and progressively worsening performance during long LIVE sessions.

The recommended implementation order is:

1. Fix the OBS runtime-overlay polling and reconnection storm.
2. Make LIVE session history writes durable, recoverable, and idempotent.
3. Move every gift allocation and correction to a persistent server-side source of truth.
4. Remove the remote gift catalogue from the critical live-scoring path.
5. Make gift deduplication survive reconnects.
6. Replace growing synchronous JSON rewrites with bounded asynchronous or database-backed persistence.
7. Add authoritative TikTok event timestamps for correct delayed-gift handling.
8. Add automated scoring, timer, allocation, reconnect, and history tests.

## Critical and high-priority findings

### 1. Runtime overlay polling and reconnection storm

The OBS runtime overlay requests `/api/runtime-overlay/state` every 250 milliseconds even though it already maintains an SSE connection. This produces four full-state HTTP requests per second for every open overlay source.

`lastRuntimeFeedAt` is updated when the SSE connection opens, but it is not updated when an SSE message arrives. After 1.5 seconds, the overlay can repeatedly close and recreate an otherwise healthy connection. This is a likely contributor to repeated 500 responses from `/api/runtime-overlay/state` and `/api/runtime-overlay/feed`.

Evidence:

- `src/routes/overlay/runtime/+page.svelte:577` — incoming messages do not update the feed activity timestamp.
- `src/routes/overlay/runtime/+page.svelte:590` — the 250 ms interval performs snapshot requests and reconnect checks.

Recommended fix:

- Use the 250 ms interval only for local visual timer rendering.
- Fetch one snapshot during startup and after confirmed reconnection.
- Rely on SSE for subsequent state updates.
- Update the activity timestamp on every message and heartbeat.
- Use a substantially longer stale-connection threshold and do not recreate a healthy `EventSource` from the polling loop.

### 2. A failed history save permanently discards the session

When a LIVE ends, the client attempts to save its session history once. If the request fails, it displays an error and then immediately clears the session gifts, allocations, game summaries, and statistics.

Evidence:

- `src/routes/+page.svelte:7746` — history save attempt and error handling.
- `src/routes/+page.svelte:7756` — unconditional UI and session-state reset after the failed request.

This directly permits the failure mode where a completed LIVE leaves no stored record.

Recommended fix:

- Generate the session ID when the LIVE starts, not on the server after it ends.
- Keep a pending session snapshot until the server acknowledges it.
- Persist the pending snapshot locally so an application crash does not lose it.
- Retry failed writes with backoff.
- Make the history endpoint idempotent by upserting the client-generated session ID.
- Only clear the pending snapshot after successful acknowledgement.

### 3. Archived-round and outside-game allocations are browser-only

Archived-round corrections modify `currentLiveGameSummaries` in browser memory without calling a server endpoint. Allocations outside games similarly update client-side score arrays.

Evidence:

- `src/routes/+page.svelte:1321` — outside-game allocation changes browser state.
- `src/routes/+page.svelte:1328` — archived-round allocation creates a client-only corrected summary.

A refresh, renderer crash, or shutdown before ending the LIVE loses these changes. The game store, ranking, audit display, and saved history can therefore disagree.

Recommended fix:

- Give every gift a durable server-side allocation record.
- Store allocation scope explicitly: LIVE session, game session, and round.
- Move or allocate the full gift through a server command.
- Derive game scores, ranking scores, audit displays, and history from the same stored allocation records.
- Record changes as auditable allocation events rather than replacing totals only.

### 4. Live scoring depends on a remote gift catalogue

The gift catalogue starts empty and is fetched from an external URL. The server awaits this request before routing a gift. A failure is silently converted to the current catalogue, which may still be empty.

Evidence:

- `src/lib/gift-catalog.ts:99` — remote catalogue loading.
- `src/lib/server/runtime-overlay.ts:557` — an unknown gift resolves to zero coins.
- `src/lib/server/runtime-overlay.ts:743` — catalogue loading is awaited in the live scoring path.

Consequences:

- A network or catalogue failure can make valid gifts score zero.
- Failed loading can be retried during later gifts.
- Loading latency can push a gift beyond the round buffer.
- A gift may appear in the UI/history while not affecting the game score.

Recommended fix:

- Package a known-good catalogue with the application.
- Persist the last successfully downloaded catalogue.
- Refresh it outside the live-event processing path.
- Prefer an authoritative coin value included in the backend gift event.
- Treat unknown gifts explicitly and visibly instead of silently assigning zero.

### 5. Reconnects can double-count server-side game scores

The server clears its recent gift IDs whenever it receives a `connected`, `idle`, `disconnected`, or `error` status. The browser preserves its deduplication state during automatic reconnects.

Evidence:

- `src/lib/server/runtime-overlay.ts:743` — server routing state is cleared on connection statuses.
- `src/lib/server/runtime-overlay.ts:595` — events without IDs are never deduplicated.
- `src/routes/+page.svelte:3444` — separate browser-side deduplication.
- `src/routes/+page.svelte:7647` — reconnect preserves the existing UI session.

If the upstream service replays recent events after reconnecting, the server can add the gifts to the game again while the browser audit log ignores them. Events without stable IDs can also be counted more than once.

Recommended fix:

- Scope deduplication by LIVE room/session ID.
- Keep recent IDs across reconnects within the same LIVE.
- Clear them only when a genuinely new LIVE session begins.
- Persist enough recent event IDs to survive a short server restart.
- Require or derive a stable fallback event key when the upstream ID is absent.

## Performance and scalability findings

### 6. Group PK rewrites its entire state file synchronously for every gift

Every Group PK gift appends another event to the active state and then performs a synchronous, pretty-printed rewrite of the complete profile collection.

Evidence:

- `src/lib/server/games.ts:2793` — gift events are copied and appended.
- `src/lib/server/games.ts:2802` and `src/lib/server/games.ts:2835` — active state is saved for every gift.
- `src/lib/server/games.ts:2353` — the entire data collection is synchronously serialized and written.

This blocks the Node event loop. As a round grows, every later gift requires more copying, serialization, and disk I/O. Gift bursts can consequently delay subsequent gifts, SSE updates, and round finalization.

Recommended fix:

- Keep scoring updates synchronous in memory but make persistence asynchronous.
- Use a debounced/checkpointed writer or append-only event journal.
- Prefer SQLite for sessions, rounds, gifts, and allocations.
- Store only bounded active state in SSE payloads.

### 7. Session history and snapshot storage are unbounded and duplicated

The application keeps every session gift and every changed game snapshot in memory. When saving, snapshots are included both at session level and again inside game sessions. Gifts are also stored both at session level and inside their game sessions. Historical sessions are retained indefinitely.

Evidence:

- `src/routes/+page.svelte:3769` — unbounded session gift log.
- `src/routes/+page.svelte:1871` — changed summaries are accumulated.
- `src/routes/+page.svelte:8501` — summaries are captured from Studio state-feed updates.
- `src/routes/+page.svelte:7681` — session payload contains gifts, snapshots, and built game histories.
- `src/lib/server/score-history.ts:329` — sessions are prepended without retention limits.
- `src/lib/server/score-history.ts:291` — the complete history file is synchronously serialized and rewritten.

History reads also return the complete stored dataset rather than a paginated session list and selected-session detail.

Recommended fix:

- Store one canonical gift record and reference it from a round by ID.
- Persist meaningful transitions rather than every state-feed mutation.
- Paginate the session list and load one session's detail on selection.
- Add configurable retention/export policies.
- Avoid embedding duplicate snapshots and gifts in the same stored session document.

### 8. Every game-store update broadcasts all game states

The Studio SSE feed serializes the runtime overlay plus all four game stores whenever any one store changes. The runtime-overlay feed follows a similar full-payload approach for relevant changes.

Evidence:

- `src/routes/api/studio/[action]/+server.ts:55` — construction of the complete Studio payload.
- `src/routes/api/studio/[action]/+server.ts:77` — complete payload sent after each subscribed store update.
- `src/routes/api/runtime-overlay/[action]/+server.ts:34` — runtime feed sends the complete overlay payload.

When game state contains growing gift-event arrays, every gift causes increasing serialization, bandwidth, parsing, and Svelte reactivity work.

Recommended fix:

- Send versioned, typed delta events for gift and score changes.
- Reserve full snapshots for startup and recovery.
- Exclude audit-only gift arrays from the render overlay state.
- Coalesce rapid changes when only presentation state needs updating.

## Logic and consistency findings

### 9. The eight-second buffer cannot distinguish delayed gifts from late gifts

Gift events do not contain their original TikTok creation timestamp. The score engine can only decide using the time the event reaches the application.

Evidence:

- `src/lib/app-types.ts:733` — gift event schema has no sent/created timestamp.
- `src/lib/game-timing.ts:1` — shared eight-second arrival buffer.
- `src/lib/server/games.ts:1075`, `src/lib/server/games.ts:2883`, and `src/lib/server/games.ts:3502` — delayed automatic finalization.

As a result, every gift arriving during the buffer counts, including gifts genuinely sent after the visible timer reached zero. The application cannot enforce the intended rule of accepting only gifts clicked before zero but delivered late.

Recommended fix:

- Include TikTok's authoritative event creation timestamp in the backend event.
- Store nominal round start and end timestamps.
- Admit a gift based on its creation timestamp, with the eight-second period used only as a waiting/finalization window.
- Define a clock-skew tolerance and log the admission decision for auditing.

### 10. Crash recovery differs between game modes

Group PK persists and restores its active round. The 1v1, Group Sticker, and Solo stores persist settings but retain active score state only in server memory.

Evidence:

- `src/lib/server/games.ts:577` — 1v1 state is held in memory.
- `src/lib/server/games.ts:1515` — Group Sticker state is held in memory.
- `src/lib/server/games.ts:2488` — Group PK restores an active persisted round.
- `src/lib/server/games.ts:3121` — Solo state is held in memory.

A server restart during a game therefore produces mode-dependent behavior: Group PK can resume while other modes silently reset.

Recommended fix:

- Use one shared round/session persistence model across all modes.
- Persist the active round identity, participants, score state, nominal timer boundaries, and gift allocations.
- On restart, restore or finalize every mode according to the same deterministic rules.

## Maintainability and verification

- `src/routes/+page.svelte` is approximately 11,500 lines and owns UI, LIVE connection handling, audit grouping, allocations, scoring summaries, persistence preparation, OBS coordination, and several modal workflows.
- `src/lib/server/games.ts` is approximately 3,500 lines and contains four distinct game engines and their storage logic.
- No automated test files were found.
- `package.json` has no test or lint script.
- The current production client output is modest in transfer size, but source complexity and runtime state growth are the primary risks.

Recommended structural changes:

- Extract a server-side session and score engine with explicit domain events.
- Give each game mode its own module implementing a common round interface.
- Extract LIVE ingestion, gift valuation, allocation, audit/history, and OBS synchronization into separate modules.
- Keep Svelte components focused on rendering and issuing commands.
- Add schema validation to all game and history commands.

## Required automated test coverage

The highest-value tests are:

1. Gift received before the timer end but delivered during the eight-second buffer.
2. Gift genuinely created after timer end but delivered during the buffer.
3. Reconnect that replays an existing gift ID.
4. Gift without an event ID.
5. Gift catalogue unavailable or missing a gift.
6. Allocation from unallocated to a cast and from one cast to another.
7. Allocation to an older completed round without changing its already-decided winner/rotation.
8. Outside-game allocation affecting ranking and session totals but not a game round.
9. Multiple 1v1, Group PK, Group Sticker, and Solo rounds without score leakage.
10. Stop/back and reopen behavior for every mode.
11. LIVE with no games and no gifts still saving start/end timestamps.
12. LIVE history write failure followed by successful retry.
13. Application/server restart during every game mode.
14. Long session with thousands of gifts to measure memory, disk-write latency, and SSE payload growth.
15. Multiple OBS overlay sources connected simultaneously.

## Validation completed during this review

- `npm run check`: passed with zero errors and zero warnings.
- Production build: passed.
- Electron main and preload syntax checks: passed.
- Installed dependency tree validation: passed.
- Production dependency audit: zero reported vulnerabilities.
- `git diff --check`: found only existing trailing whitespace in the modified README.

No application behavior was changed as part of this review.
