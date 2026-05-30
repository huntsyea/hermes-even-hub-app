import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";

const KEYS = { url: "hermes.lastUrl", session: "hermes.activeSession" } as const;

export async function saveConnectionState(bridge: EvenAppBridge, url: string, sessionId: string): Promise<void> {
  await bridge.setLocalStorage(KEYS.url, url);
  await bridge.setLocalStorage(KEYS.session, sessionId);
}

export async function loadConnectionState(bridge: EvenAppBridge): Promise<{ url: string; session: string }> {
  const url = await bridge.getLocalStorage(KEYS.url);
  const session = await bridge.getLocalStorage(KEYS.session);
  return { url: url || "", session: session || "" };
}
