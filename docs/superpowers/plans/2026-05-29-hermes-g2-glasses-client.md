# Hermes ↔ Even Realities G2 Glasses Client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive a locally-running Hermes agent hands-free from Even Realities G2 glasses — talk to it, watch replies stream, see tool calls, and switch sessions — over LAN and remotely.

**Architecture:** Two pieces plus a shared protocol. (1) A **Hermes plugin** (`hermes-evenhub-bridge`, Python) that, on load, starts a **LAN WebSocket server** on a daemon thread; the glasses connect to it directly (a WebSocket has no CORS gate). Internally the bridge drives Hermes through its **loopback API server** (`127.0.0.1:8642`) for sessions + streaming turns + tool events, and (later) transcribes mic PCM. (2) The **Even Hub app** (TypeScript, the existing project at this repo root) — a WebSocket client + container-based glasses UI. Remote access is added with **Tailscale** (no code change beyond a second whitelisted URL).

**Tech Stack:** Python 3.11 (Hermes's interpreter), `websockets`, `httpx`, `pytest` (bridge). TypeScript, Vite 8, `@evenrealities/even_hub_sdk` 0.0.10, `vitest`, EvenHub simulator + CLI (glasses app). Tailscale for remote.

---

## Conventions (apply to every task)

- **TDD:** write the failing test, watch it fail, implement minimally, watch it pass, commit.
- **Frequent commits:** one commit per task (or per red→green cycle). Conventional Commit messages.
- **Two repos:**
  - **Bridge plugin:** `/Users/huntsyea/Dev/hermes-evenhub-bridge` (new), symlinked into `~/.hermes/plugins/hermes-evenhub-bridge` so Hermes loads it.
  - **Glasses app:** `/Users/huntsyea/Dev/Even-Development` (existing — extend in place).
- **Bridge runtime deps must be importable by Hermes's interpreter.** Hermes runs from `/Users/huntsyea/.hermes/hermes-agent` on Python 3.11.15. Install bridge deps into that environment (Task 0.4). Develop/test the bridge in its own `uv` venv.
- **Shared secret:** a bridge token, stored in `~/.hermes/.env` and in the glasses app's build env. Never commit it.

## Verified facts this plan builds on (from reading the real source)

- API server: file `~/.hermes/hermes-agent/gateway/platforms/api_server.py`. `DEFAULT_HOST="127.0.0.1"`, `DEFAULT_PORT=8642`. Enabled by env `API_SERVER_ENABLED=true` + `API_SERVER_KEY=<key>`; refuses to start without a real key. Auth: `Authorization: Bearer <API_SERVER_KEY>`.
- Session endpoints: `GET /api/sessions` (query `limit`,`offset`,`order_by_last_active`), `POST /api/sessions` (`{id?,model?,system_prompt?}` → 201), `GET /api/sessions/{id}`, `PATCH /api/sessions/{id}`, `DELETE /api/sessions/{id}`, `GET /api/sessions/{id}/messages`, `POST /api/sessions/{id}/chat/stream` (SSE), `POST /api/sessions/{id}/fork`.
- Tool events in SSE: `event: hermes.tool.progress` with `{tool, emoji, label, toolCallId, status:"running"|"completed"}`. (Exact field names for the *session chat/stream* variant are captured as a fixture in Task 0.3 before any parser is written.)
- Session store: `~/.hermes/hermes-agent/gateway/session.py` — `list_sessions`, `reset_session` (new), `switch_session` (resume). We reach these via the HTTP API, not directly.
- Glasses SDK 0.0.10 surface (from `node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`): `waitForEvenAppBridge()`; `bridge.createStartUpPageContainer(new CreateStartUpPageContainer({containerTotalNum,textObject,listObject,imageObject}))`; `bridge.rebuildPageContainer(...)`; `bridge.textContainerUpgrade(...)`; `bridge.shutDownPageContainer(mode)`; `bridge.audioControl(isOpen)`; `bridge.onEvenHubEvent(cb)` with `{listEvent,textEvent,sysEvent,audioEvent}`; `audioEvent.audioPcm: Uint8Array`; `OsEventTypeList` (`CLICK_EVENT=0, SCROLL_TOP_EVENT=1, SCROLL_BOTTOM_EVENT=2, DOUBLE_CLICK_EVENT=3, FOREGROUND_ENTER_EVENT=4, FOREGROUND_EXIT_EVENT=5, IMU_DATA_REPORT=8`); `List_ItemEvent.currentSelectItemIndex/currentSelectItemName`; `bridge.setLocalStorage/getLocalStorage`. Display 576×288.

---

## File structure

**Bridge plugin** (`/Users/huntsyea/Dev/hermes-evenhub-bridge`):
```
pyproject.toml                     # uv project; deps: websockets, httpx; dev: pytest, pytest-asyncio
plugin.yaml                        # Hermes manifest
hermes_evenhub_bridge/
  __init__.py                      # register(ctx): launch server on daemon thread
  config.py                        # BridgeConfig (port, token, api_base, api_key) from env
  protocol.py                      # message constructors/validators (client<->glasses)
  hermes_client.py                 # httpx client: list/create sessions, run turn (SSE parse)
  server.py                        # websockets server: auth, dispatch, per-connection session
  asr.py                           # (M4) PCM buffer -> text
  __main__.py                      # standalone runner: python -m hermes_evenhub_bridge
tests/
  fixtures/chat_stream.sse         # real SSE capture (Task 0.3)
  test_protocol.py
  test_hermes_client.py
  test_server.py
  test_asr.py                      # (M4)
```

**Glasses app** (`/Users/huntsyea/Dev/Even-Development`, additions under `src/`):
```
src/
  config.ts                        # bridge URLs + token from Vite env (VITE_BRIDGE_*)
  protocol.ts                      # shared message types (mirror of protocol.py)
  net/ws-client.ts                 # reconnect/backoff WS client, JSON + binary
  state/store.ts                   # app state machine (view, sessions, chat, conn)
  ui/render.ts                     # SDK container builders for the two views
  ui/views.ts                      # SessionListView / ChatView render from state
  input/router.ts                  # onEvenHubEvent -> actions
  audio/capture.ts                 # (M4) audioControl + PCM forwarding
  main.ts                          # wiring/boot (replaces current demo)
tests/
  protocol.test.ts
  ws-client.test.ts
  store.test.ts
docs/superpowers/plans/2026-05-29-hermes-g2-glasses-client.md   # this file
PROTOCOL.md                        # the wire contract (source of truth for both repos)
```

---

# Milestone 0 — Validate the seams & scaffold

### Task 0.1: Create bridge repo + uv project

**Files:** Create `/Users/huntsyea/Dev/hermes-evenhub-bridge/pyproject.toml`

- [ ] **Step 1: Scaffold the project**

```bash
mkdir -p /Users/huntsyea/Dev/hermes-evenhub-bridge && cd /Users/huntsyea/Dev/hermes-evenhub-bridge
git init
uv init --package --name hermes-evenhub-bridge --python 3.11
uv add websockets httpx
uv add --dev pytest pytest-asyncio
mkdir -p hermes_evenhub_bridge tests/fixtures
```

- [ ] **Step 2: Verify the venv works**

Run: `uv run python -c "import websockets, httpx; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: scaffold hermes-evenhub-bridge uv project"
```

### Task 0.2: Enable the Hermes API server

**Files:** Modify `~/.hermes/.env` (add two lines), restart gateway.

- [ ] **Step 1: Generate a key and enable the API server**

```bash
KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
printf '\nAPI_SERVER_ENABLED=true\nAPI_SERVER_KEY=%s\n' "$KEY" >> ~/.hermes/.env
echo "API_SERVER_KEY=$KEY"   # copy this; needed by the bridge and for curl below
```

- [ ] **Step 2: Restart the gateway so it picks up the env**

Run: `hermes gateway restart` (or stop/start per your setup). 
Expected: gateway logs show the API server bound to `127.0.0.1:8642`.

- [ ] **Step 3: Verify the API server answers**

Run:
```bash
curl -s http://127.0.0.1:8642/api/sessions -H "Authorization: Bearer $KEY" | head -c 400
```
Expected: a JSON object `{"object":"list","data":[...],...}` (HTTP 200). A 401 means the key is wrong; a connection refused means the server didn't start.

### Task 0.3: Capture a real chat/stream SSE fixture (drives the parser)

**Files:** Create `/Users/huntsyea/Dev/hermes-evenhub-bridge/tests/fixtures/chat_stream.sse`

- [ ] **Step 1: Create a throwaway session and stream one turn, saving raw SSE**

```bash
KEY=<paste API_SERVER_KEY>
SID=$(curl -s -X POST http://127.0.0.1:8642/api/sessions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id') or json.load(sys.stdin).get('session_id'))")
echo "session=$SID"
curl -N -s -X POST "http://127.0.0.1:8642/api/sessions/$SID/chat/stream" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"message":"Say hi in 3 words, then run a quick shell echo."}' \
  | tee /Users/huntsyea/Dev/hermes-evenhub-bridge/tests/fixtures/chat_stream.sse
```

- [ ] **Step 2: Inspect the fixture and record the event shapes**

Run: `grep -E '^event:|^data:' tests/fixtures/chat_stream.sse | head -40`
Expected: a sequence of `event:`/`data:` lines. **Record in `PROTOCOL.md` the exact event names and JSON keys** for: text/delta events, `tool.started`/`tool.completed` (or `hermes.tool.progress`), and the terminal/done event. If `/chat/stream` 404s, fall back to `/v1/runs` + `/v1/runs/{id}/events` and capture that instead — note which endpoint won. This fixture is the contract the parser in Task 1.2 is tested against.

- [ ] **Step 3: Commit the fixture**

```bash
cd /Users/huntsyea/Dev/hermes-evenhub-bridge
git add tests/fixtures/chat_stream.sse && git commit -m "test: capture real chat/stream SSE fixture"
```

### Task 0.4: Make bridge deps importable by Hermes + symlink the plugin

**Files:** none new (environment wiring).

- [ ] **Step 1: Install runtime deps into Hermes's interpreter**

Identify Hermes's Python (from `hermes --version`: 3.11.15 at `~/.hermes/hermes-agent`). Install into it:
```bash
~/.hermes/hermes-agent/.venv/bin/python -m pip install websockets httpx 2>/dev/null \
  || uv pip install --python ~/.hermes/hermes-agent/.venv/bin/python websockets httpx
```
(If the venv path differs, locate it via `head -1 $(which hermes)` / the project path printed by `hermes --version`.)
Expected: both install or report already satisfied.

- [ ] **Step 2: Symlink the plugin into Hermes's plugin dir**

```bash
ln -s /Users/huntsyea/Dev/hermes-evenhub-bridge ~/.hermes/plugins/hermes-evenhub-bridge
ls -la ~/.hermes/plugins/hermes-evenhub-bridge
```
Expected: symlink resolves to the dev repo.

### Task 0.5: Glasses app — git init, vitest, env scaffolding

**Files:** Modify `/Users/huntsyea/Dev/Even-Development/package.json`; create `src/config.ts`, `.env.local`, `.env.example`.

- [ ] **Step 1: Init git and add vitest**

```bash
cd /Users/huntsyea/Dev/Even-Development
git init
npm i -D vitest
npm pkg set scripts.test="vitest run" scripts.test:watch="vitest"
```

- [ ] **Step 2: Add build-time config (no on-glasses keyboard needed)**

Create `src/config.ts`:
```typescript
// Bridge connection config, injected at build time via Vite env (VITE_*).
export interface BridgeConfig {
  lanUrl: string;     // ws://<mac-lan-ip>:<port>
  remoteUrl: string;  // ws://<mac>.<tailnet>.ts.net:<port>  (empty until M5)
  token: string;      // shared secret
}

export function loadConfig(): BridgeConfig {
  return {
    lanUrl: import.meta.env.VITE_BRIDGE_LAN_URL ?? "",
    remoteUrl: import.meta.env.VITE_BRIDGE_REMOTE_URL ?? "",
    token: import.meta.env.VITE_BRIDGE_TOKEN ?? "",
  };
}
```

Create `.env.example`:
```
VITE_BRIDGE_LAN_URL=ws://192.168.1.100:8765
VITE_BRIDGE_REMOTE_URL=
VITE_BRIDGE_TOKEN=replace-me
```
Copy to `.env.local` and fill with your Mac's LAN IP (`ipconfig getifaddr en0`), port `8765`, and the bridge token (same value you'll set in Task 1.5). Add `.env.local` to `.gitignore`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: git init, vitest, build-time bridge config"
```

---

# Milestone 1 — Text round-trip (no voice)

End state: type a message from the simulator's input → bridge → Hermes → final reply rendered on the glasses canvas.

### Task 1.1: Shared protocol — `PROTOCOL.md` + types

**Files:** Create `/Users/huntsyea/Dev/Even-Development/PROTOCOL.md`, `src/protocol.ts`, `tests/protocol.test.ts`; and `/Users/huntsyea/Dev/hermes-evenhub-bridge/hermes_evenhub_bridge/protocol.py`, `tests/test_protocol.py`.

The wire format (text frames are JSON with a `t` discriminator; binary frames are raw PCM, M4 only):

Client→Server: `hello{token,device}`, `sessions.list{}`, `sessions.switch{id}`, `sessions.new{title?}`, `text{text}`, `stop{}`, `audio.start{}`, `audio.stop{}`.
Server→Client: `hello.ok{caps,active}`, `sessions{items:[{id,title,updated,tokens}],active}`, `active{id}`, `transcript{text}`, `assistant{text}` (full accumulated text so far — client replaces), `tool.start{name,label,emoji}`, `tool.end{name,ok}`, `turn.done{}`, `error{msg}`.

- [ ] **Step 1: Write `PROTOCOL.md`** documenting every message above (one table per direction) plus the SSE field mapping recorded in Task 0.3. This file is the single source of truth; `protocol.ts` and `protocol.py` must match it.

- [ ] **Step 2 (glasses): Write the failing test** `tests/protocol.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { hello, parseServer } from "../src/protocol";

describe("protocol", () => {
  it("builds a hello frame", () => {
    expect(JSON.parse(hello("tok", "g2"))).toEqual({ t: "hello", token: "tok", device: "g2" });
  });
  it("parses an assistant frame", () => {
    const msg = parseServer(JSON.stringify({ t: "assistant", text: "hi" }));
    expect(msg).toEqual({ t: "assistant", text: "hi" });
  });
  it("rejects unknown types", () => {
    expect(() => parseServer(JSON.stringify({ t: "nope" }))).toThrow();
  });
});
```

- [ ] **Step 3: Run it, expect FAIL** — `npm test -- protocol` → fails (module missing).

- [ ] **Step 4: Implement `src/protocol.ts`**:
```typescript
export type ServerMsg =
  | { t: "hello.ok"; caps: Record<string, unknown>; active: string | null }
  | { t: "sessions"; items: SessionItem[]; active: string | null }
  | { t: "active"; id: string }
  | { t: "transcript"; text: string }
  | { t: "assistant"; text: string }
  | { t: "tool.start"; name: string; label?: string; emoji?: string }
  | { t: "tool.end"; name: string; ok: boolean }
  | { t: "turn.done" }
  | { t: "error"; msg: string };

export interface SessionItem { id: string; title: string; updated: number; tokens?: number; }

const SERVER_TYPES = new Set([
  "hello.ok","sessions","active","transcript","assistant","tool.start","tool.end","turn.done","error",
]);

export const hello = (token: string, device: string) => JSON.stringify({ t: "hello", token, device });
export const sessionsList = () => JSON.stringify({ t: "sessions.list" });
export const sessionsSwitch = (id: string) => JSON.stringify({ t: "sessions.switch", id });
export const sessionsNew = (title?: string) => JSON.stringify({ t: "sessions.new", title });
export const textMsg = (text: string) => JSON.stringify({ t: "text", text });
export const stopMsg = () => JSON.stringify({ t: "stop" });

export function parseServer(raw: string): ServerMsg {
  const m = JSON.parse(raw);
  if (!m || typeof m.t !== "string" || !SERVER_TYPES.has(m.t)) throw new Error(`bad server msg: ${raw}`);
  return m as ServerMsg;
}
```

- [ ] **Step 5: Run it, expect PASS** — `npm test -- protocol`.

- [ ] **Step 6 (bridge): Write `tests/test_protocol.py`** mirroring the same contract:
```python
import json
from hermes_evenhub_bridge import protocol as p

def test_parse_client_hello():
    msg = p.parse_client(json.dumps({"t": "hello", "token": "tok", "device": "g2"}))
    assert msg == {"t": "hello", "token": "tok", "device": "g2"}

def test_build_assistant():
    assert json.loads(p.assistant("hi")) == {"t": "assistant", "text": "hi"}

def test_reject_unknown_client():
    import pytest
    with pytest.raises(ValueError):
        p.parse_client(json.dumps({"t": "nope"}))
```

- [ ] **Step 7: Run it, expect FAIL** — `uv run pytest tests/test_protocol.py`.

- [ ] **Step 8: Implement `hermes_evenhub_bridge/protocol.py`**:
```python
import json

CLIENT_TYPES = {"hello","sessions.list","sessions.switch","sessions.new","text","stop","audio.start","audio.stop"}

def parse_client(raw: str) -> dict:
    m = json.loads(raw)
    if not isinstance(m, dict) or m.get("t") not in CLIENT_TYPES:
        raise ValueError(f"bad client msg: {raw!r}")
    return m

def hello_ok(active, caps=None): return json.dumps({"t": "hello.ok", "caps": caps or {}, "active": active})
def sessions(items, active): return json.dumps({"t": "sessions", "items": items, "active": active})
def active(sid): return json.dumps({"t": "active", "id": sid})
def transcript(text): return json.dumps({"t": "transcript", "text": text})
def assistant(text): return json.dumps({"t": "assistant", "text": text})
def tool_start(name, label="", emoji=""): return json.dumps({"t": "tool.start", "name": name, "label": label, "emoji": emoji})
def tool_end(name, ok=True): return json.dumps({"t": "tool.end", "name": name, "ok": ok})
def turn_done(): return json.dumps({"t": "turn.done"})
def error(msg): return json.dumps({"t": "error", "msg": msg})
```

- [ ] **Step 9: Run it, expect PASS**, then commit both repos:
```bash
cd /Users/huntsyea/Dev/Even-Development && git add -A && git commit -m "feat: shared glasses<->bridge protocol (ts)"
cd /Users/huntsyea/Dev/hermes-evenhub-bridge && git add -A && git commit -m "feat: shared glasses<->bridge protocol (py)"
```

### Task 1.2: Bridge — Hermes API client (list sessions + run turn)

**Files:** Create `hermes_evenhub_bridge/config.py`, `hermes_evenhub_bridge/hermes_client.py`, `tests/test_hermes_client.py`.

- [ ] **Step 1: Implement `config.py`** (pure, trivially testable):
```python
import os
from dataclasses import dataclass

@dataclass
class BridgeConfig:
    ws_host: str = "0.0.0.0"
    ws_port: int = 8765
    token: str = ""
    api_base: str = "http://127.0.0.1:8642"
    api_key: str = ""

    @classmethod
    def from_env(cls) -> "BridgeConfig":
        return cls(
            ws_host=os.environ.get("EVENHUB_BRIDGE_HOST", "0.0.0.0"),
            ws_port=int(os.environ.get("EVENHUB_BRIDGE_PORT", "8765")),
            token=os.environ.get("EVENHUB_BRIDGE_TOKEN", ""),
            api_base=os.environ.get("API_SERVER_BASE", "http://127.0.0.1:8642"),
            api_key=os.environ.get("API_SERVER_KEY", ""),
        )
```

- [ ] **Step 2: Write the failing SSE-parser test** `tests/test_hermes_client.py` (uses the real fixture from Task 0.3). Replace the asserted event keys with the ones you recorded in `PROTOCOL.md`:
```python
from pathlib import Path
from hermes_evenhub_bridge.hermes_client import parse_sse_events, StreamEvent

def test_parse_fixture_yields_text_and_tool_events():
    raw = Path("tests/fixtures/chat_stream.sse").read_text()
    events = list(parse_sse_events(raw))
    kinds = {e.kind for e in events}
    assert "text" in kinds            # at least one text/delta event
    assert "done" in kinds            # terminal event present
    text = "".join(e.text for e in events if e.kind == "text")
    assert len(text) > 0
```

- [ ] **Step 3: Run it, expect FAIL** — `uv run pytest tests/test_hermes_client.py`.

- [ ] **Step 4: Implement `hermes_client.py`.** Map the real event names from the fixture into a small normalized `StreamEvent`. (Names below — `output_text.delta`, `tool.started`, `tool.completed`, `done` — are placeholders to be replaced with the exact strings recorded in Task 0.3.)
```python
import json
from dataclasses import dataclass
from typing import Iterator, AsyncIterator
import httpx

@dataclass
class StreamEvent:
    kind: str            # "text" | "tool_start" | "tool_end" | "done" | "error"
    text: str = ""
    tool: str = ""
    label: str = ""
    emoji: str = ""
    ok: bool = True

def _iter_sse_blocks(raw: str):
    for block in raw.split("\n\n"):
        ev, data = None, []
        for line in block.splitlines():
            if line.startswith("event:"): ev = line[6:].strip()
            elif line.startswith("data:"): data.append(line[5:].strip())
        if data:
            yield ev, "\n".join(data)

def _to_event(ev: str | None, data: str) -> StreamEvent | None:
    if data == "[DONE]":
        return StreamEvent(kind="done")
    try: payload = json.loads(data)
    except json.JSONDecodeError: return None
    name = ev or payload.get("event") or payload.get("type") or ""
    if "delta" in name or "output_text" in name:
        return StreamEvent(kind="text", text=payload.get("delta") or payload.get("text") or "")
    if name.endswith("tool.started") or payload.get("status") == "running":
        return StreamEvent(kind="tool_start", tool=payload.get("tool",""), label=payload.get("label",""), emoji=payload.get("emoji",""))
    if name.endswith("tool.completed") or payload.get("status") == "completed":
        return StreamEvent(kind="tool_end", tool=payload.get("tool",""), ok=not payload.get("error", False))
    if "done" in name or "completed" in name:
        return StreamEvent(kind="done")
    return None

def parse_sse_events(raw: str) -> Iterator[StreamEvent]:
    for ev, data in _iter_sse_blocks(raw):
        e = _to_event(ev, data)
        if e: yield e

class HermesClient:
    def __init__(self, base: str, key: str):
        self._base, self._headers = base.rstrip("/"), {"Authorization": f"Bearer {key}"}

    async def list_sessions(self, limit=50) -> list[dict]:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{self._base}/api/sessions",
                            params={"limit": limit, "order_by_last_active": "true"}, headers=self._headers)
            r.raise_for_status()
            return r.json().get("data", [])

    async def create_session(self) -> str:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{self._base}/api/sessions", json={}, headers=self._headers)
            r.raise_for_status()
            j = r.json(); return j.get("id") or j.get("session_id")

    async def run_turn(self, session_id: str, text: str) -> AsyncIterator[StreamEvent]:
        async with httpx.AsyncClient(timeout=None) as c:
            async with c.stream("POST", f"{self._base}/api/sessions/{session_id}/chat/stream",
                                json={"message": text}, headers=self._headers) as r:
                r.raise_for_status()
                buf = ""
                async for chunk in r.aiter_text():
                    buf += chunk
                    while "\n\n" in buf:
                        block, buf = buf.split("\n\n", 1)
                        for ev, data in _iter_sse_blocks(block + "\n\n"):
                            e = _to_event(ev, data)
                            if e: yield e
```

- [ ] **Step 5: Run it, expect PASS** — `uv run pytest tests/test_hermes_client.py`. If the fixture used `/v1/runs`, point `run_turn` at that endpoint instead and adjust `_to_event` to the recorded names. Commit.

### Task 1.3: Bridge — WebSocket server (auth + dispatch)

**Files:** Create `hermes_evenhub_bridge/server.py`, `tests/test_server.py`, `hermes_evenhub_bridge/__main__.py`.

- [ ] **Step 1: Write the failing server test** (spins the real server on a random port, drives it with a `websockets` client, stubs `HermesClient`):
```python
import asyncio, json, pytest, websockets
from hermes_evenhub_bridge.server import BridgeServer
from hermes_evenhub_bridge.config import BridgeConfig

class FakeHermes:
    async def list_sessions(self, limit=50): return [{"id":"s1","title":"One","updated":1},{"id":"s2","title":"Two","updated":2}]
    async def create_session(self): return "s3"
    async def run_turn(self, session_id, text):
        from hermes_evenhub_bridge.hermes_client import StreamEvent
        yield StreamEvent(kind="text", text="hello ")
        yield StreamEvent(kind="text", text="world")
        yield StreamEvent(kind="done")

@pytest.mark.asyncio
async def test_auth_and_text_turn():
    cfg = BridgeConfig(ws_host="127.0.0.1", ws_port=0, token="secret")
    srv = BridgeServer(cfg, hermes=FakeHermes())
    port = await srv.start()
    try:
        async with websockets.connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"t":"hello","token":"secret","device":"g2"}))
            ok = json.loads(await ws.recv()); assert ok["t"] == "hello.ok"
            await ws.send(json.dumps({"t":"text","text":"hi"}))
            got = []
            while True:
                m = json.loads(await asyncio.wait_for(ws.recv(), 2))
                got.append(m)
                if m["t"] == "turn.done": break
            assert "".join(x["text"] for x in got if x["t"]=="assistant").endswith("hello world")
    finally:
        await srv.stop()

@pytest.mark.asyncio
async def test_bad_token_closes():
    cfg = BridgeConfig(ws_host="127.0.0.1", ws_port=0, token="secret")
    srv = BridgeServer(cfg, hermes=FakeHermes()); port = await srv.start()
    try:
        async with websockets.connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"t":"hello","token":"wrong","device":"g2"}))
            with pytest.raises(websockets.ConnectionClosed):
                await asyncio.wait_for(ws.recv(), 2)
    finally:
        await srv.stop()
```

- [ ] **Step 2: Run it, expect FAIL** — `uv run pytest tests/test_server.py`.

- [ ] **Step 3: Implement `server.py`.** Accumulate text and emit `assistant` frames with the **full text so far** (the glasses replace, not append). One active session per connection.
```python
import asyncio
import websockets
from . import protocol as P
from .config import BridgeConfig
from .hermes_client import HermesClient

class BridgeServer:
    def __init__(self, cfg: BridgeConfig, hermes=None):
        self._cfg = cfg
        self._hermes = hermes or HermesClient(cfg.api_base, cfg.api_key)
        self._server = None

    async def start(self) -> int:
        self._server = await websockets.serve(self._handle, self._cfg.ws_host, self._cfg.ws_port)
        return self._server.sockets[0].getsockname()[1]

    async def stop(self):
        if self._server:
            self._server.close(); await self._server.wait_closed()

    async def _handle(self, ws):
        # 1) auth handshake
        try:
            first = P.parse_client(await ws.recv())
        except Exception:
            await ws.close(code=1008, reason="bad hello"); return
        if first.get("t") != "hello" or first.get("token") != self._cfg.token:
            await ws.close(code=1008, reason="unauthorized"); return
        active = await self._hermes.create_session()
        await ws.send(P.hello_ok(active))
        # 2) command loop
        async for raw in ws:
            if isinstance(raw, (bytes, bytearray)):
                continue  # PCM handled in M4
            try: msg = P.parse_client(raw)
            except ValueError: await ws.send(P.error("bad message")); continue
            active = await self._dispatch(ws, msg, active)

    async def _dispatch(self, ws, msg, active):
        t = msg["t"]
        if t == "sessions.list":
            items = await self._hermes.list_sessions()
            await ws.send(P.sessions([self._slim(s) for s in items], active))
        elif t == "sessions.switch":
            active = msg["id"]; await ws.send(P.active(active))
        elif t == "sessions.new":
            active = await self._hermes.create_session(); await ws.send(P.active(active))
        elif t == "text":
            await self._run(ws, active, msg["text"])
        return active

    async def _run(self, ws, session_id, text):
        acc = ""
        async for e in self._hermes.run_turn(session_id, text):
            if e.kind == "text":
                acc += e.text; await ws.send(P.assistant(acc))
            elif e.kind == "tool_start":
                await ws.send(P.tool_start(e.tool, e.label, e.emoji))
            elif e.kind == "tool_end":
                await ws.send(P.tool_end(e.tool, e.ok))
            elif e.kind == "done":
                break
        await ws.send(P.turn_done())

    @staticmethod
    def _slim(s: dict) -> dict:
        return {"id": s.get("id") or s.get("session_id"),
                "title": s.get("title") or s.get("display_name") or "(untitled)",
                "updated": s.get("updated_at") or s.get("last_active") or 0,
                "tokens": s.get("total_tokens", 0)}
```

- [ ] **Step 4: Implement `__main__.py`** so the bridge runs standalone:
```python
import asyncio
from .config import BridgeConfig
from .server import BridgeServer

async def _main():
    cfg = BridgeConfig.from_env()
    srv = BridgeServer(cfg)
    port = await srv.start()
    print(f"[evenhub-bridge] listening on {cfg.ws_host}:{port} -> {cfg.api_base}")
    await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(_main())
```

- [ ] **Step 5: Run tests, expect PASS** — `uv run pytest`. Commit.

### Task 1.4: Bridge — Hermes plugin entry point

**Files:** Create `plugin.yaml`, `hermes_evenhub_bridge/__init__.py`.

- [ ] **Step 1: Write `plugin.yaml`** (confirm `kind` against an existing plugin in `~/.hermes/hermes-agent/plugins/`; use `extension` for a non-adapter background service):
```yaml
name: hermes-evenhub-bridge
version: 0.1.0
description: LAN WebSocket bridge so Even Realities G2 glasses can drive this Hermes agent.
kind: extension
requires_env:
  - EVENHUB_BRIDGE_TOKEN
  - API_SERVER_KEY
```

- [ ] **Step 2: Write `__init__.py`** — launch the server on a daemon thread with its own loop (isolated from the gateway loop):
```python
import asyncio, threading, logging
from .config import BridgeConfig
from .server import BridgeServer

log = logging.getLogger("hermes-evenhub-bridge")
_thread = None

def _run_forever():
    cfg = BridgeConfig.from_env()
    if not cfg.token:
        log.warning("EVENHUB_BRIDGE_TOKEN unset; bridge not started"); return
    loop = asyncio.new_event_loop(); asyncio.set_event_loop(loop)
    srv = BridgeServer(cfg)
    port = loop.run_until_complete(srv.start())
    log.info("evenhub bridge listening on %s:%s", cfg.ws_host, port)
    loop.run_forever()

def register(ctx) -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _thread = threading.Thread(target=_run_forever, name="evenhub-bridge", daemon=True)
    _thread.start()
```

- [ ] **Step 3: Commit.** (Live gateway verification happens in Task 1.6.)

### Task 1.5: Set the bridge token + enable the plugin

**Files:** Modify `~/.hermes/.env` and `~/.hermes/config.yaml`.

- [ ] **Step 1: Add the token to Hermes env** (must equal `VITE_BRIDGE_TOKEN` from Task 0.5):
```bash
TOK=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
printf '\nEVENHUB_BRIDGE_TOKEN=%s\nEVENHUB_BRIDGE_PORT=8765\n' "$TOK" >> ~/.hermes/.env
echo "EVENHUB_BRIDGE_TOKEN=$TOK"   # put this in Even-Development/.env.local
```

- [ ] **Step 2: Enable the user plugin** in `~/.hermes/config.yaml` under `plugins.enabled` (user plugins are opt-in):
```yaml
plugins:
  enabled:
    - hermes-evenhub-bridge
```

- [ ] **Step 3: Restart the gateway**, then confirm the port is listening:
```bash
hermes gateway restart
sleep 3 && lsof -nP -iTCP:8765 -sTCP:LISTEN
```
Expected: a Python process listening on 8765. If not, check `~/.hermes/logs` for the bridge log line / import errors (deps from Task 0.4).

### Task 1.6: Glasses — WS client (reconnect/backoff)

**Files:** Create `src/net/ws-client.ts`, `tests/ws-client.test.ts`.

- [ ] **Step 1: Write the failing test** (uses a fake WebSocket; verifies hello-on-open, message parse callback, and backoff schedule):
```typescript
import { describe, it, expect, vi } from "vitest";
import { BridgeClient } from "../src/net/ws-client";

class FakeWS {
  static last: FakeWS;
  onopen?: () => void; onmessage?: (e: { data: string }) => void; onclose?: () => void;
  sent: string[] = []; readyState = 1;
  constructor(public url: string) { FakeWS.last = this; }
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; this.onclose?.(); }
}

describe("BridgeClient", () => {
  it("sends hello on open and surfaces parsed messages", () => {
    const msgs: any[] = [];
    const c = new BridgeClient({ urls: ["ws://x"], token: "tok" }, { WS: FakeWS as any, onMessage: m => msgs.push(m) });
    c.connect();
    FakeWS.last.onopen!();
    expect(JSON.parse(FakeWS.last.sent[0])).toEqual({ t: "hello", token: "tok", device: "g2" });
    FakeWS.last.onmessage!({ data: JSON.stringify({ t: "active", id: "s1" }) });
    expect(msgs).toEqual([{ t: "active", id: "s1" }]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- ws-client`.

- [ ] **Step 3: Implement `src/net/ws-client.ts`** — cycle through `urls` (LAN then remote), exponential backoff (0.5s→8s), send `hello` on open, parse with `parseServer`, expose `send(raw)`:
```typescript
import { hello, parseServer, type ServerMsg } from "../protocol";

interface Opts { urls: string[]; token: string; }
interface Deps { WS?: typeof WebSocket; onMessage: (m: ServerMsg) => void; onStatus?: (s: string) => void; }

export class BridgeClient {
  private ws?: WebSocket; private idx = 0; private delay = 500; private alive = true;
  constructor(private o: Opts, private d: Deps) {}
  connect() {
    const WS = this.d.WS ?? WebSocket;
    const url = this.o.urls.filter(Boolean)[this.idx % Math.max(1, this.o.urls.filter(Boolean).length)];
    this.d.onStatus?.(`connecting ${url}`);
    const ws = new WS(url); this.ws = ws;
    ws.onopen = () => { this.delay = 500; this.d.onStatus?.("connected"); ws.send(hello(this.o.token, "g2")); };
    ws.onmessage = (e: MessageEvent) => { try { this.d.onMessage(parseServer(String(e.data))); } catch {} };
    ws.onclose = () => { if (!this.alive) return; this.idx++; this.d.onStatus?.("reconnecting");
      setTimeout(() => this.connect(), this.delay); this.delay = Math.min(this.delay * 2, 8000); };
    (ws as any).onerror = () => ws.close();
  }
  send(raw: string) { if (this.ws && this.ws.readyState === 1) this.ws.send(raw); }
  close() { this.alive = false; this.ws?.close(); }
}
```

- [ ] **Step 4: Run, expect PASS.** Commit.

### Task 1.7: Glasses — state store

**Files:** Create `src/state/store.ts`, `tests/store.test.ts`.

- [ ] **Step 1: Write the failing test** (reducer is pure → no SDK needed):
```typescript
import { describe, it, expect } from "vitest";
import { initialState, reduce } from "../src/state/store";

describe("store", () => {
  it("replaces assistant text on each assistant frame", () => {
    let s = initialState();
    s = reduce(s, { t: "assistant", text: "he" });
    s = reduce(s, { t: "assistant", text: "hello" });
    expect(s.chat.assistant).toBe("hello");
  });
  it("tracks tool status", () => {
    let s = reduce(initialState(), { t: "tool.start", name: "bash", emoji: "⚙" });
    expect(s.chat.tool).toEqual({ name: "bash", emoji: "⚙", running: true });
    s = reduce(s, { t: "tool.end", name: "bash", ok: true });
    expect(s.chat.tool?.running).toBe(false);
  });
  it("stores sessions and active id", () => {
    const s = reduce(initialState(), { t: "sessions", items: [{ id: "s1", title: "One", updated: 1 }], active: "s1" });
    expect(s.sessions.items.length).toBe(1); expect(s.sessions.active).toBe("s1");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `src/state/store.ts`**:
```typescript
import type { ServerMsg, SessionItem } from "../protocol";

export type View = "chat" | "sessions";
export interface AppState {
  view: View; conn: string;
  sessions: { items: SessionItem[]; active: string | null };
  chat: { assistant: string; transcript: string; tool?: { name: string; emoji?: string; running: boolean }; done: boolean };
}
export const initialState = (): AppState => ({
  view: "chat", conn: "init",
  sessions: { items: [], active: null },
  chat: { assistant: "", transcript: "", done: false },
});

export function reduce(s: AppState, m: ServerMsg): AppState {
  switch (m.t) {
    case "hello.ok": return { ...s, sessions: { ...s.sessions, active: m.active } };
    case "sessions": return { ...s, sessions: { items: m.items, active: m.active } };
    case "active": return { ...s, sessions: { ...s.sessions, active: m.id }, chat: initialState().chat };
    case "transcript": return { ...s, chat: { ...s.chat, transcript: m.text } };
    case "assistant": return { ...s, chat: { ...s.chat, assistant: m.text, done: false } };
    case "tool.start": return { ...s, chat: { ...s.chat, tool: { name: m.name, emoji: m.emoji, running: true } } };
    case "tool.end": return { ...s, chat: { ...s.chat, tool: s.chat.tool ? { ...s.chat.tool, running: false } : undefined } };
    case "turn.done": return { ...s, chat: { ...s.chat, done: true } };
    case "error": return { ...s, conn: `error: ${m.msg}` };
    default: return s;
  }
}
```

- [ ] **Step 4: Run, expect PASS.** Commit.

### Task 1.8: Glasses — render the chat view + wire boot

**Files:** Create `src/ui/render.ts`, `src/ui/views.ts`, `src/input/router.ts`; rewrite `src/main.ts`; update `app.json` permissions.

- [ ] **Step 1: Implement `src/ui/render.ts`** — thin wrappers over the SDK so views stay declarative:
```typescript
import {
  CreateStartUpPageContainer, TextContainerProperty, TextContainerUpgrade,
} from "@evenrealities/even_hub_sdk";
import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";

export const IDS = { header: 1, body: 2, status: 3 } as const;

export async function buildChatPage(bridge: EvenAppBridge) {
  await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 3,
    textObject: [
      new TextContainerProperty({ containerID: IDS.header, containerName: "header", xPosition: 0, yPosition: 0,  width: 576, height: 40,  paddingLength: 4, content: "Hermes" }),
      new TextContainerProperty({ containerID: IDS.body,   containerName: "body",   xPosition: 0, yPosition: 44, width: 576, height: 200, paddingLength: 4, content: "", isEventCapture: 1 }),
      new TextContainerProperty({ containerID: IDS.status, containerName: "status", xPosition: 0, yPosition: 248,width: 576, height: 36,  paddingLength: 4, content: "connecting…" }),
    ],
  }));
}

export async function setText(bridge: EvenAppBridge, id: number, content: string) {
  await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: id, content }));
}
```
> Confirm `TextContainerUpgrade`'s exact field names against `index.d.ts` while implementing; adjust if it differs (e.g. a `text` vs `content` key).

- [ ] **Step 2: Implement `src/ui/views.ts`** — paginate the body to the last N chars that fit (G2 body shows ~a few hundred chars), show tool line in status:
```typescript
import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { IDS, setText } from "./render";

const BODY_MAX = 400; // tune against device

export async function renderChat(bridge: EvenAppBridge, s: AppState) {
  const tail = s.chat.assistant.slice(-BODY_MAX);
  await setText(bridge, IDS.body, tail || s.chat.transcript || "Double-tap to talk");
  const status = s.chat.tool
    ? `${s.chat.tool.emoji ?? "⚙"} ${s.chat.tool.name}${s.chat.tool.running ? "…" : " ✓"}`
    : (s.chat.done ? "✓ done" : s.conn);
  await setText(bridge, IDS.status, status);
}
```

- [ ] **Step 3: Implement `src/input/router.ts`** — map gestures to actions (double-tap = talk toggle [M4]; single tap = send a stub/typed text in M1):
```typescript
import { OsEventTypeList } from "@evenrealities/even_hub_sdk";
import type { EvenHubEvent } from "@evenrealities/even_hub_sdk";

export interface InputActions {
  onClick: () => void; onDoubleClick: () => void;
  onScrollUp: () => void; onScrollDown: () => void;
}
export function routeEvent(e: EvenHubEvent, a: InputActions) {
  const et = e.sysEvent?.eventType ?? e.listEvent?.eventType ?? e.textEvent?.eventType;
  if (et === OsEventTypeList.CLICK_EVENT) a.onClick();
  else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) a.onDoubleClick();
  else if (et === OsEventTypeList.SCROLL_TOP_EVENT) a.onScrollUp();
  else if (et === OsEventTypeList.SCROLL_BOTTOM_EVENT) a.onScrollDown();
}
```

- [ ] **Step 4: Rewrite `src/main.ts`** to wire it all. In M1, a single tap sends a fixed test message (`"What time is it?"`) so we can prove the round-trip without voice:
```typescript
import { waitForEvenAppBridge } from "@evenrealities/even_hub_sdk";
import { loadConfig } from "./config";
import { BridgeClient } from "./net/ws-client";
import { initialState, reduce, type AppState } from "./state/store";
import { buildChatPage } from "./ui/render";
import { renderChat } from "./ui/views";
import { routeEvent } from "./input/router";
import { textMsg } from "./protocol";

async function boot() {
  const bridge = await waitForEvenAppBridge();
  await buildChatPage(bridge);
  let state: AppState = initialState();
  const cfg = loadConfig();
  const client = new BridgeClient(
    { urls: [cfg.lanUrl, cfg.remoteUrl], token: cfg.token },
    { onMessage: (m) => { state = reduce(state, m); void renderChat(bridge, state); },
      onStatus: (s) => { state = { ...state, conn: s }; void renderChat(bridge, state); } },
  );
  client.connect();
  bridge.onEvenHubEvent((e) => routeEvent(e, {
    onClick: () => client.send(textMsg("What time is it?")),
    onDoubleClick: () => bridge.shutDownPageContainer(1),
    onScrollUp: () => {}, onScrollDown: () => {},
  }));
}
boot().catch((err) => console.error("[glasses] boot failed", err));
```

- [ ] **Step 5: Add the network whitelist** to `app.json` (LAN IP from Task 0.5; add the Tailscale host in M5):
```json
"permissions": [
  { "name": "network", "desc": "Connect to local Hermes bridge", "whitelist": ["ws://192.168.1.100:8765"] }
]
```

- [ ] **Step 6: Build + verify it compiles** — `npm run build`. Expected: no TS errors. Commit.

### Task 1.9: End-to-end smoke in the simulator

- [ ] **Step 1: Start everything**

```bash
# gateway with the bridge plugin is already running (Task 1.5). Confirm:
lsof -nP -iTCP:8765 -sTCP:LISTEN
cd /Users/huntsyea/Dev/Even-Development && npm run dev   # vite on :5173
```

- [ ] **Step 2: Launch the simulator and drive it**

In another shell: `npm run sim` (simulator points at `http://localhost:5173`, automation on :9898). Use the **everything-evenhub:simulator-automation** skill (or `npm run sim:check`) to send a single **click** and capture a screenshot.
Expected: status line goes `connecting… → connected`; after the click, the body shows a streamed reply ending in a final answer; status shows `✓ done`. Console shows no errors.

- [ ] **Step 3: If broken, isolate the layer:** `curl` the bridge port with a `websocket` client (or `python -m websockets ws://127.0.0.1:8765`) and replay `hello`+`text` to see whether the failure is bridge-side or app-side. Fix, re-run. Commit when green.

---

# Milestone 2 — Live streaming + tool-call visibility

Streaming already flows (Task 1.3 emits incremental `assistant` frames; Task 1.7/1.8 render them). This milestone proves and polishes it.

### Task 2.1: Throttle render churn on the glasses

**Files:** Modify `src/main.ts` (wrap `renderChat` in a rAF/timeout coalescer).

- [ ] **Step 1: Write the failing test** `tests/render-throttle.test.ts` for a `coalesce(fn, ms)` helper (only one call per window). 
- [ ] **Step 2–4:** Implement `src/util/coalesce.ts`, make it pass, and use it so rapid `assistant` frames don't spam `textContainerUpgrade` (the bridge writes must be serialized per glasses-ui best practices). Commit.

### Task 2.2: Verify tool indicators end-to-end

- [ ] **Step 1:** Prompt the agent (via the test click message, temporarily `"run: echo hello"`) so it calls a shell tool. In the simulator, confirm the status line shows `⚙ <tool>…` during the call and `⚙ <tool> ✓` after, then `✓ done`. Screenshot for the record. If tool events don't arrive, re-check `_to_event` mapping against the Task 0.3 fixture. Commit any fixes.

---

# Milestone 3 — Session list / switch / new

### Task 3.1: Glasses — sessions view (list + select)

**Files:** Modify `src/ui/render.ts` (add `buildSessionsPage` using `ListContainerProperty`/`ListItemContainerProperty`), `src/ui/views.ts` (`renderSessions`), `src/state/store.ts` (add `view` toggle + selection), `src/input/router.ts`/`src/main.ts` (handle `List_ItemEvent`).

- [ ] **Step 1: Write the failing store test** for view switching and that selecting an item index resolves to a session id:
```typescript
// tests/store.sessions.test.ts
import { describe, it, expect } from "vitest";
import { initialState, reduce, selectSessionId } from "../src/state/store";
it("resolves a list index to a session id", () => {
  const s = reduce(initialState(), { t: "sessions", items: [{id:"a",title:"A",updated:1},{id:"b",title:"B",updated:2}], active: "a" });
  expect(selectSessionId(s, 1)).toBe("b");
});
```
- [ ] **Step 2–4:** Add `selectSessionId(state, index)` and a `view` field toggle to the store; implement `buildSessionsPage` with a single `ListContainerProperty` whose `itemContainer.itemName` is the session titles; on `List_ItemEvent` with `CLICK_EVENT`, read `currentSelectItemIndex`, call `client.send(sessionsSwitch(id))`, then switch `view` back to `chat`. Make tests pass.

- [ ] **Step 5: Add navigation** — e.g. a long-press/triple gesture or a reserved list row "＋ New" (index 0) → `sessionsNew()`. A dedicated gesture toggles between chat and sessions views (request `sessionsList()` on entering). Build, commit.

### Task 3.2: Simulator verification of session switching

- [ ] **Step 1:** In the simulator, open the sessions view, scroll the list (SCROLL events), select a different session, confirm `active` changes (header updates, chat clears), send a message, confirm it lands in that session (`hermes sessions list` on the Mac shows activity on the chosen session id). Select "＋ New", confirm a fresh session id. Screenshot. Commit.

---

# Milestone 4 — Voice (PCM → Mac STT)

### Task 4.1: Decide the STT engine (spike)

- [ ] **Step 1:** Check whether Hermes already exposes transcription we can reuse (it has `~/.hermes/audio_cache` and `gateway_voice_mode.json`): `grep -ri "transcri\|whisper\|/audio\|stt" ~/.hermes/hermes-agent/gateway | head`. If a local STT endpoint/util exists, prefer it. Otherwise use `faster-whisper` (`uv add faster-whisper`; also install into Hermes's interpreter per Task 0.4). Record the choice in `PROTOCOL.md`.

### Task 4.2: Bridge — ASR module

**Files:** Create `hermes_evenhub_bridge/asr.py`, `tests/test_asr.py`.

- [ ] **Step 1: Write the failing test** — feed a known WAV (16k mono) decoded to PCM bytes through `transcribe_pcm(bytes) -> str` and assert it returns non-empty text containing an expected word. (Bundle a tiny fixture WAV, or synthesize silence + assert empty-string handling for the unit test, and gate the real-audio assertion behind an opt-in env marker.)
- [ ] **Step 2–4:** Implement `transcribe_pcm` (buffer s16le 16k mono → the chosen engine). Keep the engine behind a small interface so it's swappable. Make tests pass.

### Task 4.3: Bridge — accept PCM frames + end-of-utterance

**Files:** Modify `server.py` (handle `audio.start`/binary/`audio.stop`).

- [ ] **Step 1: Write the failing server test** — client sends `audio.start`, several binary PCM chunks, `audio.stop`; expect a `transcript` frame then an `assistant`/`turn.done` sequence (stub the ASR to return `"hello"` and stub `run_turn`).
- [ ] **Step 2–4:** Buffer binary frames between `audio.start`/`audio.stop`; on stop, `transcribe_pcm`, emit `P.transcript(text)`, then `_run(ws, active, text)`. Make tests pass. Commit.

### Task 4.4: Glasses — capture and stream PCM

**Files:** Create `src/audio/capture.ts`; modify `src/input/router.ts`/`src/main.ts` (double-tap toggles mic).

- [ ] **Step 1: Implement `capture.ts`** — `await bridge.audioControl(true)`, subscribe to `onEvenHubEvent`, forward `event.audioEvent.audioPcm` as **binary** WS frames; on stop, `audioControl(false)` + send `audio.stop`. Clean up on `beforeunload`/foreground-exit (per device-features skill).
- [ ] **Step 2:** Wire double-tap: first double-tap → `audio.start` + mic on (status `🎤 listening`); second → mic off + `audio.stop`. Render the returned `transcript` then the streamed reply.
- [ ] **Step 3:** Add microphone permission to `app.json` if the SDK requires it. Build, commit.

### Task 4.5: Device/simulator verification

- [ ] **Step 1:** Voice path can't be fully exercised in the simulator (no mic PCM). Verify on hardware via `npm run qr` sideload: double-tap, speak, confirm `transcript` appears then the agent replies. Note any latency; tune end-of-utterance. Commit notes.

---

# Milestone 5 — Remote access via Tailscale

### Task 5.1: Bring Mac + phone onto one tailnet

- [ ] **Step 1:** `tailscale status` on the Mac (already installed). Ensure it's logged in and the Mac has a stable MagicDNS name (`tailscale status --json | python3 -c "import sys,json;print(json.load(sys.stdin)['Self']['DNSName'])"`). Install/sign in Tailscale on the phone, same tailnet.
- [ ] **Step 2:** Confirm reachability: from the phone's browser (or another tailnet device) open `http://<mac>.<tailnet>.ts.net:8765` — expect a WebSocket-upgrade error page (proves the port is reachable), not a timeout. The bridge already binds `0.0.0.0`, so no code change.

### Task 5.2: Add the remote URL to the app + verify failover

**Files:** Modify `.env.local` (`VITE_BRIDGE_REMOTE_URL=ws://<mac>.<tailnet>.ts.net:8765`) and `app.json` whitelist (add the same origin).

- [ ] **Step 1:** Rebuild and sideload. The `BridgeClient` already cycles LAN→remote on failure (Task 1.6). Verify: on home WiFi it uses LAN; on cellular (WiFi off) it falls over to the Tailscale URL and still works. Screenshot/log both. Commit.

---

# Milestone 6 — Finish notifications & polish

### Task 6.1: Glasses — completion cue when not actively watching

**Files:** Modify `src/state/store.ts`/`src/ui/views.ts` — on `turn.done` while the body was scrolled away or view≠chat, show a prominent `✓ done` banner + brief reply preview; clear on next interaction.

- [ ] **Step 1:** Write a store test asserting a `notify` flag is set on `turn.done` when `view==="sessions"`, cleared on view change. Implement, render the banner, commit.

### Task 6.2: Resilience polish

**Files:** `src/net/ws-client.ts`, `src/main.ts`, `server.py`.

- [ ] **Step 1:** Persist last-good URL + active session via `bridge.setLocalStorage` and restore on boot (so reconnects resume the right session). Add a `stop` gesture wired to `stopMsg()` (maps to `/v1/runs/{id}/stop` or interrupt — confirm endpoint). Add a heartbeat/ping so dead sockets are detected quickly. Write a store/ws test for the persistence + reconnect-resume, implement, commit.

### Task 6.3: Package

- [ ] **Step 1:** `npm run pack` → produces the `.ehpk`. Document in `README.md`: how to start the gateway (with API server + bridge enabled), set the two env values, build/sideload the app, and connect. Commit. Optionally tag `v0.1.0` in both repos.

---

## Self-Review (run after implementation, fix inline)

- **Spec coverage:** session mgmt (M3), live streaming (M1/M2), tool-call visibility (M2), finish notifications (M6), voice-on-Mac (M4), remote (M5), plugin-hosts-WS architecture (M1) — all mapped. ✓
- **Placeholder honesty:** the only deliberately-deferred specifics are the **SSE event field names** (`_to_event` in `hermes_client.py`) and the `TextContainerUpgrade` field name — both are resolved against real artifacts captured in Task 0.3 / read from `index.d.ts` *before* the dependent code is finalized. Do not leave them as guesses past those tasks.
- **Type consistency:** `protocol.ts` ServerMsg types ↔ `protocol.py` constructors ↔ `store.ts` reducer cases ↔ `PROTOCOL.md` — keep all four in lockstep; the `assistant` frame carries **full accumulated text** (replace semantics) everywhere.
- **Risk watch:** if a non-`platform` plugin's `register()` is not invoked in gateway mode, fall back to running the bridge as a standalone service (`python -m hermes_evenhub_bridge` via launchd / a `config.yaml` shell hook) — the server module is identical, only the launcher changes.

## Notes on decomposition

This plan spans two subsystems sharing one protocol; they're co-developed because nothing is testable end-to-end until both speak it. If you prefer separate execution streams, split at the milestone boundary after M1 (bridge stream vs glasses stream), keeping `PROTOCOL.md` as the contract. Each milestone leaves the system in a working, demoable state.
