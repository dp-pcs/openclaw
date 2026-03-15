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
  // Derive a stable gateway ID from hostname
  // In future phases, this could use a config-defined stable ID
  const gatewayId = os.hostname().toLowerCase();

  // Use hostname as display name
  // In future phases, this could be configurable
  const displayName = os.hostname();

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
