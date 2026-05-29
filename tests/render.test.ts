import { describe, it, expect, vi } from "vitest";
import { setText, IDS } from "../src/ui/render";

function fakeBridge() {
  const calls: any[] = [];
  return {
    bridge: { textContainerUpgrade: vi.fn(async (arg: any) => { calls.push(arg); }) } as any,
    calls,
  };
}

describe("setText", () => {
  it("sends full-replace params with the matching container name", async () => {
    const { bridge, calls } = fakeBridge();
    await setText(bridge, IDS.status, "x");
    expect(calls).toHaveLength(1);
    const arg = calls[0];
    expect(arg.containerID).toBe(IDS.status);
    expect(arg.containerName).toBe("status");
    expect(arg.contentOffset).toBe(0);
    expect(arg.contentLength).toBe(0);
    expect(arg.content).toBe("x");
  });

  it("uses the right name for each known container id", async () => {
    const { bridge, calls } = fakeBridge();
    await setText(bridge, IDS.header, "h");
    await setText(bridge, IDS.body, "b");
    expect(calls[0].containerName).toBe("header");
    expect(calls[1].containerName).toBe("body");
  });
});
