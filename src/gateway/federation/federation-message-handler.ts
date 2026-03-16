import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "../hooks.js";
import { MAX_PREAUTH_PAYLOAD_BYTES } from "../server-constants.js";
import { verifyMessage } from "./federation-message.js";
import { getPeer, hasNonce, recordNonce } from "./federation-peers.js";

type FederationMessageBody = {
  fromGatewayId: string;
  intent: string;
  payload: object;
  replyTo: string;
  timestamp: string;
  nonce: string;
  signature: string;
};

// In-memory reply store for async responses
const replyStore = new Map<string, unknown>();

/**
 * Validate that a timestamp is within ±5 minutes of now
 */
function isValidTimestamp(timestamp: string): boolean {
  try {
    const ts = new Date(timestamp).getTime();
    const now = Date.now();
    const diff = Math.abs(now - ts);
    const fiveMinutes = 5 * 60 * 1000;
    return diff <= fiveMinutes;
  } catch {
    return false;
  }
}

/**
 * Validate a federation message body
 */
function validateFederationMessage(body: unknown): body is FederationMessageBody {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const msg = body as Record<string, unknown>;
  return (
    typeof msg.fromGatewayId === "string" &&
    typeof msg.intent === "string" &&
    typeof msg.payload === "object" &&
    msg.payload !== null &&
    typeof msg.replyTo === "string" &&
    typeof msg.timestamp === "string" &&
    typeof msg.nonce === "string" &&
    typeof msg.signature === "string"
  );
}

/**
 * Process a message intent and return a response
 */
async function processIntent(
  intent: string,
  payload: object,
  ourGatewayId: string,
): Promise<object> {
  switch (intent) {
    case "ping":
      return {
        status: "ok",
        gatewayId: ourGatewayId,
        timestamp: new Date().toISOString(),
      };

    case "web-search": {
      const query = (payload as { query?: string }).query;
      if (typeof query !== "string") {
        return { error: "Missing query parameter" };
      }

      try {
        // Use DuckDuckGo Instant Answer API
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const response = await fetch(url);
        const data = (await response.json()) as unknown;
        return { result: data };
      } catch (err) {
        return { error: String(err) };
      }
    }

    default:
      return { error: `Unknown intent: ${intent}` };
  }
}

/**
 * Send a reply to the remote gateway
 */
async function sendReply(replyTo: string, response: object): Promise<void> {
  try {
    await fetch(replyTo, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(response),
    });
  } catch {
    // Log error but don't fail - the remote will timeout
  }
}

/**
 * Handle POST /federation/message
 * Receives signed messages from approved peers
 */
export async function handleFederationMessage(
  req: IncomingMessage,
  res: ServerResponse,
  stateDir: string,
  ourGatewayId: string,
): Promise<boolean> {
  const method = (req.method ?? "POST").toUpperCase();
  if (method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  try {
    const bodyResult = await readJsonBody(req, MAX_PREAUTH_PAYLOAD_BYTES);
    if (!bodyResult.ok) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: bodyResult.error }));
      return true;
    }

    const body = bodyResult.value;
    if (!validateFederationMessage(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Invalid message body" }));
      return true;
    }

    // Look up peer
    const peer = await getPeer(stateDir, body.fromGatewayId);
    if (!peer || peer.status !== "approved") {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Peer not found or not approved" }));
      return true;
    }

    // Check intent is in scope
    if (!peer.scope.includes(body.intent)) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `Intent ${body.intent} not in approved scope` }));
      return true;
    }

    // Verify timestamp
    if (!isValidTimestamp(body.timestamp)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Timestamp out of range (±5 minutes)" }));
      return true;
    }

    // Check for replay attack
    if (await hasNonce(stateDir, body.fromGatewayId, body.nonce)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Nonce already used (replay attack detected)" }));
      return true;
    }

    // Build verification payload (everything except signature)
    const verificationPayload = {
      fromGatewayId: body.fromGatewayId,
      intent: body.intent,
      payload: body.payload,
      replyTo: body.replyTo,
      timestamp: body.timestamp,
      nonce: body.nonce,
    };

    // Verify signature
    if (!verifyMessage(peer.publicKey, verificationPayload, body.signature)) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return true;
    }

    // Record nonce to prevent replay
    await recordNonce(stateDir, body.fromGatewayId, body.nonce);

    // Return 202 immediately
    res.statusCode = 202;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "accepted" }));

    // Process intent asynchronously and send reply
    setImmediate(async () => {
      try {
        const response = await processIntent(body.intent, body.payload, ourGatewayId);
        await sendReply(body.replyTo, response);
      } catch {
        // Silent failure - remote will timeout
      }
    });

    return true;
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: String(err) }));
    return true;
  }
}

/**
 * Handle POST /federation/reply/:nonce
 * Receives async replies from remote gateways
 */
export async function handleFederationReply(
  req: IncomingMessage,
  res: ServerResponse,
  nonce: string,
): Promise<boolean> {
  const method = (req.method ?? "POST").toUpperCase();
  if (method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  try {
    const bodyResult = await readJsonBody(req, MAX_PREAUTH_PAYLOAD_BYTES);
    if (!bodyResult.ok) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: bodyResult.error }));
      return true;
    }

    const body = bodyResult.value;

    // Store reply for CLI polling
    replyStore.set(nonce, body);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "received" }));
    return true;
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: String(err) }));
    return true;
  }
}

/**
 * Get a reply from the store (used by CLI polling)
 */
export function getReply(nonce: string): unknown {
  return replyStore.get(nonce);
}

/**
 * Clear a reply from the store
 */
export function clearReply(nonce: string): void {
  replyStore.delete(nonce);
}
