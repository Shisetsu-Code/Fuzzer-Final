# Prepared demo sessions

User intent: GitHub Actions is online before a chat is called, and loads the indicated demos in advance. GPT operates a ready game instead of spending context on startup, navigation and intro handling.

Implementation choices: same browser context from preparation to operations; `prepare_games` creates one durable job per game. Ready sessions wait for `act(kind=resume)` before executing their configured suite. Existing `run_games` reuses a matching ready single-game job. A configurable pool (two browser contexts by default) lets another demo prepare while a session is held or executing. This is a resource concurrency setting, not a round/step cutoff.

Readiness means: live runner presence, game frame at BASE/idle with actionable game controls, known intro dismissed, latest screenshot uploaded. An unknown/loading/expired screen is never advertised ready. Preparation saves load/intro evidence. It does not start normal spins, Ante or purchases. Operation budgets start on activation, not while waiting prepared.

Plan (native execution, user already delegated implementation details):
- [x] Worker tests first: presence/liveness, idempotent batch preparation, ready state, activation and reuse; implement additive migration and MCP tools.
- [x] Session tests first: intro-only preparation, explicit activation, same-context execution; implement preparation and readiness checks.
- [x] Pool tests first: two queued sessions can prepare while the first waits; implement runner presence and independent slots.
- [x] Real-browser fixture verifies no gameplay request during preparation and reuse of the same page on activation.
- [x] Run full suite and CI, provision migration, deploy, start Actions, and verify a real ready demo before handing a job to a chat.

Live verification (2026-10-23): CI 40042767454 passed; Actions service 40042846658 prepared Gates of Olympus as job `3296dcc9-dde9-4ece-a628-180fe052d7d4`. Before chat activation it was `ready`, operation_started was null, and evidence contained one load and one intro continuation with zero spins. Final 2 activated that same job, which completed one normal spin with no error. Final evidence contained exactly one load, one intro continuation and one spin, confirming activation reused the prepared page. Worker deployment: `312188f6-013f-453a-88c4-a7b83b4c66c7`. Validation also passed 27 unit/runtime tests and two real Chromium tests.

Review focus: no duplicate prepared jobs on tool retries; no context loss at activation; no false ready from promotional/unknown UI; parked sessions keep heartbeats; separate job snapshots/commands across slots; runner shutdown removes presence; activation never silently repeats operations.
