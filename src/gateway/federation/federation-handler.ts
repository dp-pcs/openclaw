import type { IncomingMessage, ServerResponse } from "node:http";
import { buildFederationCard, type FederationCard } from "./federation-card.js";
import { loadIntentRegistry } from "./federation-intent-registry.js";

/**
 * Handle GET /.well-known/openclaw-federation requests.
 * Returns the federation card as JSON with CORS headers.
 * Reads intent registry dynamically so capabilities reflect current state.
 * This endpoint is publicly accessible (no auth required).
 */
export async function handleFederationWellKnown(
  req: IncomingMessage,
  res: ServerResponse,
  card: FederationCard,
  stateDir?: string,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  // Reload registry dynamically so capabilities reflect current registered intents
  let liveCard = card;
  if (stateDir) {
    try {
      const registry = await loadIntentRegistry(stateDir);
      liveCard = {
        ...card,
        capabilities: buildFederationCard({} as never, card.publicKey, registry).capabilities,
      };
    } catch {
      // Fall back to startup card on error
    }
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache"); // Don't cache — capabilities change dynamically
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD");

  if (method === "HEAD") {
    res.end();
  } else {
    res.end(JSON.stringify(liveCard));
  }

  return true;
}
