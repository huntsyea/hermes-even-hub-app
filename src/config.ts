export interface BridgeDefaults {
  url: string;
  token: string;
}

export function loadBridgeDefaults(): BridgeDefaults {
  return {
    url: import.meta.env.VITE_BRIDGE_URL
      ?? import.meta.env.VITE_BRIDGE_LAN_URL
      ?? import.meta.env.VITE_BRIDGE_REMOTE_URL
      ?? "",
    token: import.meta.env.VITE_BRIDGE_TOKEN ?? "",
  };
}
