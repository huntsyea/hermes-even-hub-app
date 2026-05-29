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
