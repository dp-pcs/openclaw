import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type { IntentRegistry } from "./federation-intent-registry.js";
import { getCapableIntents } from "./federation-intent-registry.js";

type OgpConfig = {
  displayName?: string;
  email?: string;
  acceptMeetingsWindow?: { start: string; end: string; tz: string };
};

/**
 * Load OGP-specific config from ogp-config.json in state dir.
 * Kept separate from openclaw.json which has a strict schema.
 */
function loadOgpConfig(stateDir?: string): OgpConfig {
  if (!stateDir) {
    return {};
  }
  try {
    const p = path.join(stateDir, "ogp-config.json");
    return JSON.parse(fs.readFileSync(p, "utf-8")) as OgpConfig;
  } catch {
    return {};
  }
}

export type FederationCapability = "calendar-read" | "web-search" | "general";

export type FederationCard = {
  gatewayId: string;
  publicKey: string;
  displayName: string;
  email?: string; // Owner's email — only shared post-trust, never on public well-known
  version: string;
  capabilities: FederationCapability[];
  rateHints: {
    maxRequestsPerMinute: number;
  };
};

/**
 * Build a federation card from config and public key.
 * The federation card is returned by the /.well-known/openclaw-federation endpoint.
 * OGP config (email, displayName, meeting window) is read from ogp-config.json in state dir.
 */
export function buildFederationCard(
  config: OpenClawConfig,
  publicKey: string,
  registry?: IntentRegistry,
  stateDir?: string,
): FederationCard {
  // Load OGP config from state dir (separate from openclaw.json to avoid schema conflicts)
  const ogpConfig = loadOgpConfig(stateDir ?? process.env.OPENCLAW_STATE_DIR);

  // Derive a stable gateway ID from hostname + port
  const port = process.env.OPENCLAW_GATEWAY_PORT ?? "18789";
  const hostname = os.hostname().toLowerCase();
  const gatewayId = port === "18789" ? hostname : `${hostname}:${port}`;

  // Display name: ogp-config.json > hostname fallback
  const displayName =
    ogpConfig.displayName ?? (port === "18789" ? os.hostname() : `${os.hostname()} (port ${port})`);

  // Email from ogp-config only — not from openclaw.json
  const email = ogpConfig.email;

  // Capabilities from registry if available, otherwise fallback to ["ping"]
  const capableIntents = registry ? getCapableIntents(registry) : ["ping"];

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

  const version = "2026.3.14";

  return {
    gatewayId,
    publicKey,
    displayName,
    ...(email ? { email } : {}),
    version,
    capabilities,
    rateHints: {
      maxRequestsPerMinute: 60,
    },
  };
}
