# PingCLI LAB

Tier: Demo.
Repo: https://github.com/curtismu7/pingcli-LAB
Catalog: D126

An identity admin automates a PingOne environment from a terminal with [Ping CLI](https://github.com/pingidentity/pingcli). The lab offers 14 allow-listed, read-only `pingcli` commands (users, apps, groups, populations, identity providers, resources, roles, sign-on and MFA policies, environments, config keys, version, agent skills list and install). Each command shows the steps it needs (install, `pingcli init`, `pingcli pingone auth login`, run), streams its output to the browser, and turns the JSON into an easy-read table or form.

Derived from the AI-DEMO2 /pingcli page (read-only source, never imported). Scaffold copied from observability-LAB (origin/main, 2026-11-09): its safety, netguard, health, workspace, cast/story, trace, doctor, reset, content-pack and UI-standard pieces were kept and all of its log, Loki and SIEM features removed.

**Status:** shipped: on the demo shelf (port 7806) and behind the lab-proxy at `https://local.ping-devops.com:8443/pingcli/`.

## The page

One page with five tabs in the Ping UI standard (dark shell bar with the Ping Red rule, the simulation banner first on every tab and in presenter mode, Mock/Real toggle and theme toggle in the header, usable at 375px):

- **Commands**: the AI-DEMO2 page ported: Install, Configure and authenticate, How to run (collapsible, remembered), command cards by category with Copy and Run; the result opens right under the category of the card that was run, with a run status, one line showing what the command needed (installed → configured → authenticated → the command, each linking back to its section; Install starts collapsed once pingcli answers with a version), Easy read (table or form) vs JSON (highlighted up to 8000 characters). When Real is not configured, a how-to replaces the source page's sign-in prompt.
- **Story**: the vertical picker (banking, healthcare, retail), scenarios that open their command, and every claim with its status.
- **Diagram**: `pingcli-flow` loaded by name from diagram-studio data (movable boxes, Simulate, speed, Reset positions).
- **Trace**: the last run's hops in the shared evidence screens (sequence view, movie reel, step detail) with raw request/response and `traceparent`; Mock hops and tokens are labelled MOCK, Real redacts tokens.
- **Talk track**, presenter mode (P / Esc) and Reset (stops the run, clears output and trace, restores diagram positions).

Command output is always rendered as text: control, bidi and ANSI escape characters show as visible escapes, and the page caps what it keeps. JSON nested deeper than 200 levels is shown as raw text, and each panel sits behind an error boundary, so a bad output can never blank the page. Why a run failed or stopped (timeout, output cap, auth failure) shows on its own line, with a marker when the server cut the output. A duplicated browser tab takes its own workspace (BroadcastChannel claim), so it never collides with the original tab's run.

Shared code vendored, never imported: `web/src/evidence/` and `server/src/vendor/` from AI-DEMO-Standalone `shared/evidence` and `shared/hop-detail` (@ 12077c4; the shared catalog and lanes now carry this lab's four hop kinds and actors); `scripts/lib/shelf-registry-rules.mjs` and `shelf-tags.json` from demo-shelf-LAB (@ bf40c28).

## Modes (rule 19: Mock, Real and a runtime toggle)

**Mock (the default when Real is not configured; no tenant, no credentials, no network).** No binary runs. Every command plays canned output shaped like pingcli 1.2.0 output, flavoured by the chosen vertical (banking, healthcare, retail), with made-up UUIDs and `.example` hosts, streamed in a few chunks so it feels live. Every response says `source: "mock"`, and the token request is simulated.

**Real (owner-run).** Runs the real `pingcli` binary against your own PingOne environment with worker client credentials:

- Settings: `PINGONE_ENVIRONMENT_ID`, `PINGONE_REGION` (NA, EU, CA, AP/ASIA, AU, SG), `PINGONE_CLIENT_ID`, `PINGONE_CLIENT_SECRET`, read from the one settings file `~/Development/.env` (or `STANDALONE_ENV`), or from the process environment (Docker: compose passes them through from your shell or an `.env` beside the compose file; never baked, never committed).
- Binary: the Docker image bakes pingcli 1.2.0 (sha256-pinned). On the host set `PINGCLI_BIN` to its absolute path or put `pingcli` on PATH.
- The client secret is write-only: never returned, shown, logged or put in a label. See `docs/safety.md` for the private profile, scrubbing, timeouts and limits.

`GET /api/info` reports `source`, `realAvailable` and a non-secret `realHowTo`; `POST /api/mode` with exactly `{ "source": "mock" | "real" }` switches at runtime (409 when Real is not configured). This lab signs nobody in, so there is no persona picker (rule 11 is met by the mode header).

## Run from a clone

Prerequisites: Node 26 or newer. Docker (OrbStack) only if you use the Docker form. Mock works with no setup at all: no tenant, no credentials, no settings file, no pingcli binary.

```
git clone https://github.com/curtismu7/pingcli-LAB.git
cd pingcli-LAB
npm ci
npm run build
npm run doctor
npm start
```

Open http://127.0.0.1:7806/ (the server serves the built page itself). `GET /api/health` answers `demo-health/1`. Or with Docker: `docker compose up --build -d` from the same folder.

## Run

- Host: `./scripts/run.sh` (Node 26+), then open http://localhost:7806/.
- Docker (OrbStack): `docker compose up --build -d`, published on `127.0.0.1:7806` only (Mock unless the four settings are in your shell).
- Docker with Real: `npm run docker:up` (`scripts/compose-real.mjs`) passes the four `PINGONE_*` settings from `~/Development/.env` (or `STANDALONE_ENV`; a value already in your shell wins) to `docker compose` through its environment only. It prints which keys are set, never a value, and writes nothing.
- Test: `npm test` (server: `node --test test/*.test.js`, a glob; web: vitest; scripts: `node --test scripts/*.test.mjs`). Browser check: start the lab, then `npm run e2e` (Playwright headless Chromium; `npx playwright install chromium-headless-shell` once; `SHOT_DIR=` saves screenshots). Preflight: `npm run doctor`. Reset: `npm run reset`. Talk track: `npm run talk-track`. Content pack: `npm run content-pack`.

## API

`GET /api/commands` (the AI-DEMO2 contract: `[{ key, label, runnable, auth, prereqs }]` plus `title` and `category`), `GET /api/stream?commandKey=` (SSE: `meta`, `chunk`..., `done` with `exitCode`, `source` and the trace hops), `POST /api/run` `{ commandKey }` -> `{ command, output, exitCode, source, hops }`, `GET /api/version`, `GET /api/health` (`demo-health/1`), `GET /api/info`, `POST /api/mode`, `POST /api/reset`, `GET /api/runs`, `GET /api/story?vertical=`, `GET /api/diagram?name=pingcli-flow`, `GET /api/shelf`. Unknown or copy-only keys are 400. State is per workspace (`X-Workspace`, default `default`). Every run carries a W3C `traceparent` per hop with the raw request and response.

## Honesty

Product claims carry a status in `server/src/storyData.js`: `observed-in-AI-DEMO2` (named source file, still UNVERIFIED here), `UNVERIFIED`, or `lab` (pinned by this lab's tests). For example, "pingcli 1.2.0 env-scoped subcommands fail with worker client credentials, so the lab uses `pingone api`" was observed in AI-DEMO2 and is UNVERIFIED in this lab. `agent-skills list`, `agent-skills install` and `config list-keys` in Mock replay output captured from the real pingcli 1.2.0 binary on 2026-11-09 (no tenant; the install directory is shown as `<sandbox>`). The tenant commands' shapes follow the envelope the AI-DEMO2 page parses and stay UNVERIFIED until the owner's Real run.

## Catalog

Catalog id **D126** (owner, 2026-11-09): in the shelf entry and the Learning Hub content pack.

## Ports, and what to do if the port is taken

```
Ports: pingcli-LAB listens on 7806 only (allocated with npm run ports -- --next in demo-shelf-LAB).
Docker publishes it on 127.0.0.1:7806 only.

If the port is taken:
1. Find what is using it:
   lsof -iTCP:7806 -sTCP:LISTEN -n -P
2. If it is an old copy of this lab (npm start), stop that process: kill <PID>.
   If it is this lab's container: docker compose down (from this folder).
3. If it is something else, stop it. The lab refuses any other port on purpose
   (one port per app; npm run doctor says so), so free 7806 rather than moving the lab.
4. Then start again: npm start, or docker compose up -d.
```
