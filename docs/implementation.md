# Fuzzer Final

Scope: public DEMO games, ordinary spin, Ante Bet/equivalent and every discovered purchase variant. Keep one browser context per game. Never turn a failed or unrecognized screen into a successful result.

Architecture: a small authenticated stateless MCP on a Cloudflare Worker; D1 holds jobs, commands, controls and HTTP/WS endpoint indexes; private R2 holds screenshots and complete bounded traces. GitHub Actions runs a persistent Playwright agent. Known states proceed automatically. Unknown states expose their screenshot to ChatGPT through the same MCP, whose coordinate actions continue the existing session immediately. No classify/upload/relaunch barrier.

Animation speed defaults to 4, configurable 1–8; wall-clock timeouts and network are not accelerated. Coordinates are normalized against a recorded 1280x720 viewport and frame rectangle. Each recorded action includes pre/post images, timing, kind, label, state and network correlation. Binary WS frames use base64. Session parameters are private evidence, not portable credentials; a future replay must obtain a fresh demo session.

Implementation plan (native execution):
- [x] Test command validation, job claims, stale observation rejection and trace encoding. Implement shared contracts and D1 schema.
- [x] Test MCP initialization, authentication, commands, completion and export against local D1/R2. Implement Worker and job dispatch.
- [x] Test browser HTTP/WS capture and coordinate clicks on a controlled demo fixture. Implement recorder, clock, runtime/DOM adapter and persistent executor.
- [x] Implement Actions workflow, startup checks and minimal operator instructions. Run checks, unit/integration tests and Worker dry run.
- [x] Publish repository, provision dedicated Cloudflare resources and run an actual demo smoke test when credentials permit. Record exact deployment/test evidence.

Review focus: unknown canvas controls, changing confirmation labels, interrupted click without duplicate execution, slow or failed network, expired GitHub runner. Explicit timeout/blocked/error statuses rather than silent success. Provider support is empirical: generic DOM plus Pragmatic adapter, visual MCP fallback for other canvases.

Ruling: user explicitly requested implementation without further design rounds and delegated infrastructure choices. Continue native execution. Existing unrelated Fuzzer deployments and secrets are untouched.

Verification ledger: 19 unit/runtime tests passed (D1/R2 and complete PKCE OAuth exchange), real Chromium HTTP/WS fixture passed, syntax and Worker dry-run passed. Local live Gates of Olympus completed normal=1, Ante=1, purchases=1, including 15 free spins and return to base; seven persisted actions. Initial attempts preserved as partial; fixes cover intro checkbox, Ante path, moving confirmation geometry, numeric start/result continuations. Fresh reviewer findings addressed: no false ignored-spin success, no duplicate purchase after visual recovery, menu exhaustion, bounded body reads, no command redelivery, stop during auto execution, error evidence preservation, active-round watchdog bypass and ambient-motion false progress.

## Deployed verification

- Worker: `https://fuzzer-final.braian-n-l.workers.dev/mcp`; health confirms dedicated D1/R2 and runner token. Deployment version `7de00e9e-e913-4322-865f-630217d7a573`.
- D1: `fuzzer-final`, migration `0001.sql` applied remotely; private R2: `fuzzer-final-evidence`.
- [Actions demo pilot](https://github.com/Shisetsu-Code/Fuzzer-Final/actions/runs/40038984014): job `27117d42-298b-4f24-a8c0-727392c8b411` completed a purchased bonus and returned to BASE idle. One pause/resume happened in the SAME session, without repeating the purchase. Four action records (load, intro, purchase, continuation), 13 stored controls, 58 per-action endpoint index rows (53 distinct transport/method/endpoint combinations), 107 HTTP payload-bearing events recovered through authenticated MCP/R2. This game used HTTP; binary WS capture was separately verified with the real-browser fixture, not falsely claimed from this game.
- Earlier cloud pilot verified one normal and one Ante spin. Its interrupted bonus remains stopped/incomplete, not converted into success. The first complete local pilot covered normal + Ante + purchase in one continuous session.
- Subsequent fixes remove internal default time/step/input budgets, retain only optional caller budgets, and observe round counters/network/phase for stalls. Decor changes do not extend the watchdog. Date-based animation acceleration has a deterministic test; server/network outcomes remain real-time.
- [CI with Date acceleration and OAuth/storage tests](https://github.com/Shisetsu-Code/Fuzzer-Final/actions/runs/40039547332) passed. Current CI also covers counter-based progress.
- Immediate GitHub dispatch is optional and not configured: `run_games` queues work for an active/scheduled runner. No broad GitHub personal token was copied into Cloudflare. ChatGPT OAuth connection is a user sign-in step; its dedicated key stays outside Git.
