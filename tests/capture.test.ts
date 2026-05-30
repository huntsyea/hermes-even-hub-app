import { describe, it, expect, vi } from "vitest";
import { createCapture } from "../src/audio/capture";
import { audioStart, audioStop } from "../src/protocol";

function fakeBridge() {
  return {
    audioControl: vi.fn(async (_on: boolean) => {}),
  } as any;
}

function fakeClient() {
  return {
    send: vi.fn(),
    sendBinary: vi.fn(),
  } as any;
}

describe("createCapture", () => {
  it("start sends audioStart then enables mic", async () => {
    const bridge = fakeBridge();
    const client = fakeClient();
    const capture = createCapture(bridge, client);

    await capture.start();

    expect(client.send).toHaveBeenCalledWith(audioStart());
    expect(bridge.audioControl).toHaveBeenCalledWith(true);
    // audioStart must be called before audioControl
    const sendOrder = client.send.mock.invocationCallOrder[0];
    const controlOrder = bridge.audioControl.mock.invocationCallOrder[0];
    expect(sendOrder).toBeLessThan(controlOrder);
  });

  it("stop disables mic then sends audioStop", async () => {
    const bridge = fakeBridge();
    const client = fakeClient();
    const capture = createCapture(bridge, client);

    await capture.start();
    client.send.mockClear();
    bridge.audioControl.mockClear();

    await capture.stop();

    expect(bridge.audioControl).toHaveBeenCalledWith(false);
    expect(client.send).toHaveBeenCalledWith(audioStop());
    // audioControl(false) must be called before audioStop send
    const controlOrder = bridge.audioControl.mock.invocationCallOrder[0];
    const sendOrder = client.send.mock.invocationCallOrder[0];
    expect(controlOrder).toBeLessThan(sendOrder);
  });

  it("handleEvent forwards PCM as binary when recording", async () => {
    const bridge = fakeBridge();
    const client = fakeClient();
    const capture = createCapture(bridge, client);

    await capture.start();

    const pcm = new Uint8Array([1, 2, 3, 4]);
    capture.handleEvent({ audioEvent: { audioPcm: pcm } });

    expect(client.sendBinary).toHaveBeenCalledWith(pcm);
  });

  it("handleEvent ignores events when not recording", () => {
    const bridge = fakeBridge();
    const client = fakeClient();
    const capture = createCapture(bridge, client);

    const pcm = new Uint8Array([1, 2, 3]);
    capture.handleEvent({ audioEvent: { audioPcm: pcm } });

    expect(client.sendBinary).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
  });

  it("handleEvent ignores empty PCM buffers", async () => {
    const bridge = fakeBridge();
    const client = fakeClient();
    const capture = createCapture(bridge, client);

    await capture.start();
    capture.handleEvent({ audioEvent: { audioPcm: new Uint8Array(0) } });

    expect(client.sendBinary).not.toHaveBeenCalled();
  });

  it("start is idempotent (does not enable mic twice)", async () => {
    const bridge = fakeBridge();
    const client = fakeClient();
    const capture = createCapture(bridge, client);

    await capture.start();
    await capture.start();

    expect(bridge.audioControl).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it("stop is idempotent (does not disable mic twice)", async () => {
    const bridge = fakeBridge();
    const client = fakeClient();
    const capture = createCapture(bridge, client);

    await capture.start();
    bridge.audioControl.mockClear();
    client.send.mockClear();

    await capture.stop();
    await capture.stop();

    expect(bridge.audioControl).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it("recording flag reflects current state", async () => {
    const bridge = fakeBridge();
    const client = fakeClient();
    const capture = createCapture(bridge, client);

    expect(capture.recording).toBe(false);
    await capture.start();
    expect(capture.recording).toBe(true);
    await capture.stop();
    expect(capture.recording).toBe(false);
  });
});
