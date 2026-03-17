import os from "node:os";
import type { OpenClawConfig } from "../../config/config.js";
import type { IntentRegistry } from "./federation-intent-registry.js";
import { getCapableIntents } from "./federation-intent-registry.js";

export type FederationCapability = "calendar-read" | "web-search" | "general";

export type FederationCard = {
  gatewayId: string;
  publicKey: string;
  displayName: string;
  email?: string; // Owner's email — used by peers for calendar invites, messages, etc.
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
export function buildFederationCard(
  config: OpenClawConfig,
  publicKey: string,
  registry?: IntentRegistry,
): FederationCard {
  // Derive a stable gateway ID from hostname + port
  // In future phases, this should use a config-defined stable ID (e.g. owner email)
  const port = process.env.OPENCLAW_GATEWAY_PORT ?? "18789";
  const hostname = os.hostname().toLowerCase();
  const gatewayId = port === "18789" ? hostname : `${hostname}:${port}`;

  // Use hostname (+ port if non-default) as display name
  const displayName = port === "18789" ? os.hostname() : `${os.hostname()} (port ${port})`;

  // Email from config if set — used by peers for calendar invites, attendee fields, etc.
  // Configure via openclaw.json: { "federation": { "email": "you@example.com", "displayName": "Your Name" } }
  const email =
    (config as Record<string, unknown> & { federation?: { email?: string; displayName?: string } })
      ?.federation?.email ?? undefined;
  const configuredDisplayName = (
    config as Record<string, unknown> & { federation?: { displayName?: string } }
  )?.federation?.displayName;

  // Capabilities from registry if available, otherwise fallback to ["ping"]
  const capableIntents = registry ? getCapableIntents(registry) : ["ping"];

  // Map intents to legacy capability types for backwards compatibility
  // For Phase 3A, we'll keep the existing capability structure but base it on real handlers
  const capabilities: FederationCapability[] = [];
  if (capableIntents.includes("web-search")) {
    capabilities.push("web-search");
  }
  if (capableIntents.some((i) => i.includes("calendar"))) {
    capabilities.push("calendar-read");
  }
  if (capableIntents.length > 1) {
    capabilities.push("general");
  }

  // Version from package.json - we'll use a placeholder for now
  // In production this should be imported from package.json
  const version = "2026.3.14";

  return {
    gatewayId,
    publicKey,
    displayName: configuredDisplayName ?? displayName,
    ...(email ? { email } : {}),
    version,
    capabilities,
    rateHints: {
      maxRequestsPerMinute: 60,
    },
  };
}
