import os from "node:os";
import type { OpenClawConfig } from "../../config/config.js";

export type FederationCapability = "calendar-read" | "web-search" | "general";

export type FederationCard = {
  gatewayId: string;
  publicKey: string;
  displayName: string;
  version: string;
  capabilities: FederationCapability[];
  rateHints: {
    maxRequestsPerMinute: number;
  };
};

/**
 * Build a federation card from config and public key.
 * The federation card is returned by the /.well-known/openclaw-federation endpoint.
 */
export function buildFederationCard(config: OpenClawConfig, publicKey: string): FederationCard {
  // Derive a stable gateway ID from hostname + port
  // In future phases, this should use a config-defined stable ID (e.g. owner email)
  const port = process.env.OPENCLAW_GATEWAY_PORT ?? "18789";
  const hostname = os.hostname().toLowerCase();
  const gatewayId = port === "18789" ? hostname : `${hostname}:${port}`;

  // Use hostname (+ port if non-default) as display name
  const displayName = port === "18789" ? os.hostname() : `${os.hostname()} (port ${port})`;

  // For Phase 0, capabilities are static
  // In future phases, this will be derived from installed plugins and config
  const capabilities: FederationCapability[] = ["calendar-read", "web-search", "general"];

  // Version from package.json - we'll use a placeholder for now
  // In production this should be imported from package.json
  const version = "2026.3.14";

  return {
    gatewayId,
    publicKey,
    displayName,
    version,
    capabilities,
    rateHints: {
      maxRequestsPerMinute: 60,
    },
  };
}
