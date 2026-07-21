import { defineConfig } from "vite";

// Allow access through Tailscale Serve (MagicDNS hostnames) in addition to
// LAN IPs. Vite blocks unknown Host headers by default (DNS-rebinding
// protection), which returns 403 for *.ts.net URLs without this.
export default defineConfig({
  server: {
    allowedHosts: [".ts.net"],
  },
});
