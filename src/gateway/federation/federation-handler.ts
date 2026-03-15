import type { IncomingMessage, ServerResponse } from "node:http";
import type { FederationCard } from "./federation-card.js";

/**
 * Handle GET /.well-known/openclaw-federation requests.
 * Returns the federation card as JSON with CORS headers.
 * This endpoint is publicly accessible (no auth required).
 */
export function handleFederationWellKnown(
  req: IncomingMessage,
  res: ServerResponse,
  card: FederationCard,
): boolean {
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD");

  if (method === "HEAD") {
    res.end();
  } else {
    res.end(JSON.stringify(card));
  }

  return true;
}
