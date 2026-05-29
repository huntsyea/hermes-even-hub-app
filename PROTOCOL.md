# Even Realities G2 ↔ Hermes Bridge — Wire Protocol

Version: 1.0  
Transport: WebSocket (text frames = JSON, binary frames = raw PCM — see below)  
Discriminator field: `t` (string, required on every frame)

---

## Client → Server (glasses app sends)

| `t`               | Fields                              | Description |
|-------------------|-------------------------------------|-------------|
| `hello`           | `token: string`, `device: string`   | First frame after connect. Authenticates the client and identifies the device model. |
| `sessions.list`   | _(none)_                            | Request the full session list. |
| `sessions.switch` | `id: string`                        | Activate an existing session by ID. |
| `sessions.new`    | `title?: string`                    | Create a new session, optionally with a title. |
| `text`            | `text: string`                      | Send a user text message to the active session. |
| `stop`            | _(none)_                            | Interrupt the active assistant turn. |
| `audio.start`     | _(none)_                            | Begin streaming PCM audio (see Binary Frames below). |
| `audio.stop`      | _(none)_                            | End PCM audio stream. |

---

## Server → Client (bridge sends to glasses)

| `t`          | Fields                                                          | Description |
|--------------|-----------------------------------------------------------------|-------------|
| `hello.ok`   | `caps: Record<string, unknown>`, `active: string \| null`       | Handshake acknowledgement. `caps` lists server capabilities; `active` is the currently active session ID (or null). |
| `sessions`   | `items: SessionItem[]`, `active: string \| null`                | Full session list. `active` is the currently active session ID. |
| `active`     | `id: string`                                                    | Notifies the client which session is now active (after switch or new). |
| `transcript` | `text: string`                                                  | A transcription chunk of user speech. |
| `assistant`  | `text: string`                                                  | **Full accumulated assistant text so far.** The client MUST replace (not append) its displayed body with this value each time it arrives. The bridge accumulates deltas and always emits the running total. |
| `tool.start` | `name: string`, `label?: string`, `emoji?: string`              | A tool invocation has started. |
| `tool.end`   | `name: string`, `ok: boolean`                                   | A tool invocation completed. `ok=false` indicates failure. |
| `turn.done`  | _(none)_                                                        | The assistant turn is complete; no further `assistant` or `tool.*` frames will arrive for this turn. |
| `error`      | `msg: string`                                                   | An error occurred on the server side. |

### `SessionItem` shape

```jsonc
{
  "id":      "string",   // unique session ID
  "title":   "string",   // human-readable title
  "updated": 1234567890, // Unix timestamp (seconds) of last activity
  "tokens":  1024        // optional token count
}
```

---

## Binary Frames (M4)

Between an `audio.start` and the matching `audio.stop` JSON frame, the client MAY send **binary WebSocket frames** containing raw PCM audio data:

- Encoding: **signed 16-bit little-endian (s16le)**
- Sample rate: **16 000 Hz**
- Channels: **mono**

The server buffers and transcribes these frames. No acknowledgement is sent per chunk. Binary frames outside an audio stream window are ignored.

---

## Internal: Hermes SSE Mapping

The bridge connects to a Hermes API server that emits Server-Sent Events. This section records the authoritative mapping from Hermes SSE event types to glasses protocol frames.

| Hermes SSE event       | Relevant data fields                                                   | Glasses frame emitted |
|------------------------|------------------------------------------------------------------------|-----------------------|
| `assistant.delta`      | `data.delta` — incremental text chunk                                  | Bridge **accumulates** all deltas, then emits `assistant{text=<accumulated so far>}` |
| `assistant.completed`  | `data.content` — full final text                                       | `assistant{text=data.content}` — authoritative final value; bridge resets accumulator |
| `tool.started`         | `data.tool_name`, `data.preview` (human label), `data.args`            | `tool.start{name=tool_name, label=preview}` |
| `tool.completed`       | `data.tool_name`                                                        | `tool.end{name=tool_name, ok=true}` |
| `done`                 | _(named terminal event, no data fields required)_                       | `turn.done{}` |
| `tool.progress` where `tool_name="_thinking"` | —                                                | **Ignored** (swallowed by bridge, not forwarded) |

### Session creation

When `sessions.new` is handled, the bridge POSTs to the Hermes API. The response JSON shape is:

```jsonc
{
  "object": "hermes.session",
  "session": {
    "id": "<session-id>",
    // ... other fields
  }
}
```

The session ID is nested at `response.session.id` (not at the top level).
