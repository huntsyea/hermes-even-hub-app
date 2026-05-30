import { describe, it, expect, vi } from "vitest";
import { saveConnectionState, loadConnectionState } from "../src/storage/persist";
import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";

function makeBridge(stored: Record<string, string> = {}): EvenAppBridge {
  const db = { ...stored };
  return {
    setLocalStorage: vi.fn(async (key: string, value: string) => { db[key] = value; }),
    getLocalStorage: vi.fn(async (key: string) => db[key] ?? ""),
  } as unknown as EvenAppBridge;
}

describe("persist", () => {
  it("saveConnectionState stores url and session under correct keys", async () => {
    const bridge = makeBridge();
    await saveConnectionState(bridge, "ws://192.168.1.10:8765", "sess-abc");
    expect(bridge.setLocalStorage).toHaveBeenCalledWith("hermes.lastUrl", "ws://192.168.1.10:8765");
    expect(bridge.setLocalStorage).toHaveBeenCalledWith("hermes.activeSession", "sess-abc");
  });

  it("loadConnectionState returns stored values", async () => {
    const bridge = makeBridge({
      "hermes.lastUrl": "ws://100.64.0.1:8765",
      "hermes.activeSession": "sess-xyz",
    });
    const result = await loadConnectionState(bridge);
    expect(result).toEqual({ url: "ws://100.64.0.1:8765", session: "sess-xyz" });
  });

  it("loadConnectionState returns empty strings for missing keys", async () => {
    const bridge = makeBridge();
    const result = await loadConnectionState(bridge);
    expect(result).toEqual({ url: "", session: "" });
  });
});
