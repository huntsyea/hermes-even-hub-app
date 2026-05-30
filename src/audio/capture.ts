import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { BridgeClient } from "../net/ws-client";
import { audioStart, audioStop } from "../protocol";

export interface AudioCapture {
  /** true when the mic is on */
  readonly recording: boolean;
  /** Start capture: send audio.start frame then audioControl(true) */
  start(): Promise<void>;
  /** Stop capture: audioControl(false) then send audio.stop frame */
  stop(): Promise<void>;
  /** Call on every onEvenHubEvent — forwards PCM if recording */
  handleEvent(event: any): void;
}

export function createCapture(bridge: EvenAppBridge, client: BridgeClient): AudioCapture {
  let recording = false;
  return {
    get recording() { return recording; },
    async start() {
      if (recording) return;
      recording = true;
      client.send(audioStart());
      await bridge.audioControl(true);
    },
    async stop() {
      if (!recording) return;
      recording = false;
      await bridge.audioControl(false);
      client.send(audioStop());
    },
    handleEvent(event: any) {
      if (!recording) return;
      const pcm = event?.audioEvent?.audioPcm;
      if (pcm instanceof Uint8Array && pcm.length > 0) {
        client.sendBinary(pcm);
      }
    },
  };
}
