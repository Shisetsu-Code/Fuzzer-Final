# Fuzzer Final

Scope: public DEMO games, ordinary spin, Ante Bet/equivalent and every discovered purchase variant. Keep one browser context per game. Never turn a failed or unrecognized screen into a successful result.

Architecture: a small authenticated stateless MCP on a Cloudflare Worker; D1 holds jobs, commands, controls and HTTP/WS endpoint indexes; private R2 holds screenshots and complete bounded traces. GitHub Actions runs a persistent Playwright agent. Known states proceed automatically. Unknown states expose their screenshot to ChatGPT through the same MCP, whose coordinate actions continue the existing session immediately. No classify/upload/relaunch barrier.

Animation speed defaults to 4, configurable 1–8; wall-clock timeouts and network are not accelerated. Coordinates are normalized against a recorded 1280x720 viewport and frame rectangle. Each recorded action includes pre/post images, timing, kind, label, state and network correlation. Binary WS frames use base64. Session parameters are private evidence, not portable credentials; a future replay must obtain a fresh demo session.

Implementation plan (native execution):
- [ ] Test command validation, job claims, stale observation rejection and trace encoding. Implement shared contracts and D1 schema.
- [ ] Test MCP initialization, authentication, commands, completion and export against local D1/R2. Implement Worker and job dispatch.
- [ ] Test browser HTTP/WS capture and coordinate clicks on a controlled demo fixture. Implement recorder, clock, runtime/DOM adapter and persistent executor.
- [ ] Implement Actions workflow, startup checks and minimal operator instructions. Run checks, unit/integration tests and Worker dry run.
- [ ] Publish repository, provision dedicated Cloudflare resources and run an actual demo smoke test when credentials permit. Record exact deployment/test evidence.

Review focus: unknown canvas controls, changing confirmation labels, interrupted click without duplicate execution, slow or failed network, expired GitHub runner. Explicit timeout/blocked/error statuses rather than silent success. Provider support is empirical: generic DOM plus Pragmatic adapter, visual MCP fallback for other canvases.

Ruling: user explicitly requested implementation without further design rounds and delegated infrastructure choices. Continue native execution. Existing unrelated Fuzzer deployments and secrets are untouched.
