import { describe, it, expect, vi } from "vitest";
import { renderChat, renderSessions } from "../src/ui/views";
import type { AppState } from "../src/state/store";
import { initialState } from "../src/state/store";

function fakeBridge() {
  const textCalls: any[] = [];
  return {
    bridge: {
      textContainerUpgrade: vi.fn(async (arg: any) => { textCalls.push(arg); }),
      rebuildPageContainer: vi.fn(async () => {}),
    } as any,
    textCalls,
  };
}

function stateWith(overrides: Partial<AppState>): AppState {
  return { ...initialState(), ...overrides };
}

describe("renderChat", () => {
  it("sets header to active session title", async () => {
    const { bridge, textCalls } = fakeBridge();
    const s = stateWith({
      sessions: {
        items: [
          { id: "s1", title: "My Chat", updated: "" },
          { id: "s2", title: "Other", updated: "" },
        ],
        active: "s1",
      },
    });
    await renderChat(bridge, s);
    const headerCall = textCalls.find((c: any) => c.containerName === "header");
    expect(headerCall).toBeDefined();
    expect(headerCall.content).toBe("My Chat");
  });

  it("falls back to 'Hermes' when no active session", async () => {
    const { bridge, textCalls } = fakeBridge();
    const s = stateWith({ sessions: { items: [], active: null } });
    await renderChat(bridge, s);
    const headerCall = textCalls.find((c: any) => c.containerName === "header");
    expect(headerCall).toBeDefined();
    expect(headerCall.content).toBe("Hermes");
  });

  it("falls back to 'Hermes' when active id not found in items", async () => {
    const { bridge, textCalls } = fakeBridge();
    const s = stateWith({
      sessions: {
        items: [{ id: "s1", title: "Chat", updated: "" }],
        active: "nonexistent",
      },
    });
    await renderChat(bridge, s);
    const headerCall = textCalls.find((c: any) => c.containerName === "header");
    expect(headerCall.content).toBe("Hermes");
  });

  it("uses '(untitled)' for active session with empty title", async () => {
    const { bridge, textCalls } = fakeBridge();
    const s = stateWith({
      sessions: {
        items: [{ id: "s1", title: "", updated: "" }],
        active: "s1",
      },
    });
    await renderChat(bridge, s);
    const headerCall = textCalls.find((c: any) => c.containerName === "header");
    expect(headerCall.content).toBe("(untitled)");
  });

  it("still renders body and status", async () => {
    const { bridge, textCalls } = fakeBridge();
    const s = stateWith({
      conn: "connected",
      chat: { assistant: "Hello world", transcript: "", done: false },
    });
    await renderChat(bridge, s);
    const bodyCall = textCalls.find((c: any) => c.containerName === "body");
    const statusCall = textCalls.find((c: any) => c.containerName === "status");
    expect(bodyCall.content).toBe("Hello world");
    expect(statusCall.content).toBe("connected");
  });

  it("shows '🎤 listening' in status when recording is true", async () => {
    const { bridge, textCalls } = fakeBridge();
    const s = stateWith({
      recording: true,
      conn: "connected",
      chat: { assistant: "", transcript: "", done: false },
    });
    await renderChat(bridge, s);
    const statusCall = textCalls.find((c: any) => c.containerName === "status");
    expect(statusCall.content).toBe("🎤 listening");
  });
});
