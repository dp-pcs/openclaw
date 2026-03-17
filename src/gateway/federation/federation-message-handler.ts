import { execSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "../hooks.js";
import { MAX_PREAUTH_PAYLOAD_BYTES } from "../server-constants.js";
import { loadIntentRegistry } from "./federation-intent-registry.js";
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
 * NOTE: Command execution uses execSync from registry-configured commands only.
 * Commands are stored in the registry, not received from message payloads.
 */
async function processIntent(
  intent: string,
  payload: Record<string, unknown>,
  ourGatewayId: string,
  stateDir: string,
): Promise<object> {
  const registry = await loadIntentRegistry(stateDir);
  const handler = registry.handlers[intent] ?? registry.custom[intent];

  if (!handler && intent !== "ping") {
    return { error: `Intent ${intent} not implemented`, code: 501 };
  }

  switch (handler?.type ?? "builtin") {
    case "builtin":
      // ping handled here
      if (intent === "ping") {
        return {
          status: "ok",
          gatewayId: ourGatewayId,
          timestamp: new Date().toISOString(),
        };
      }
      return { error: "Unknown builtin", code: 501 };

    case "command": {
      // Substitute {param} placeholders with payload values
      let cmd = handler.command!;
      for (const [key, value] of Object.entries(payload)) {
        cmd = cmd.replace(`{${key}}`, String(value));
      }
      // Execute command and return output
      try {
        const output = execSync(cmd, { timeout: 10000, encoding: "utf8" });
        // Try to parse as JSON, otherwise return as text
        try {
          return JSON.parse(output) as object;
        } catch {
          return { output: output.trim() };
        }
      } catch (err) {
        return { error: `Command failed: ${String(err)}` };
      }
    }

    default:
      return { error: `Handler type ${handler?.type} not yet supported`, code: 501 };
  }
}

/**
 * Send a reply to the remote gateway
 */
async function sendReply(replyTo: string, response: object): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(replyTo, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
      signal: controller.signal,
    });
    clearTimeout(timeout);
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

    // Apply scopeParams enforcement
    const peerScopeParams = peer.scopeParams?.[body.intent];
    if (peerScopeParams) {
      const enforcedPayload = { ...body.payload } as Record<string, unknown>;
      for (const [param, rule] of Object.entries(peerScopeParams)) {
        if (rule.mode === "enforce") {
          enforcedPayload[param] = rule.value;
        } else if (rule.mode === "restrict") {
          const sent = enforcedPayload[param];
          if (rule.allowed && !rule.allowed.includes(String(sent))) {
            // Default to first allowed value
            enforcedPayload[param] = rule.allowed[0];
          }
        }
      }
      body.payload = enforcedPayload;
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
        const response = await processIntent(
          body.intent,
          body.payload as Record<string, unknown>,
          ourGatewayId,
          stateDir,
        );
        await sendReply(body.replyTo, response);
      } catch (err) {
        // Log error so we can debug; send error reply so CLI doesn't just timeout
        console.error(`[ogp] intent processing failed: ${String(err)}`);
        await sendReply(body.replyTo, { error: String(err) }).catch(() => {});
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

  // GET — poll for reply (used by CLI)
  if (method === "GET") {
    const reply = replyStore.get(nonce);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ reply: reply ?? null }));
    return true;
  }

  // DELETE — clear reply (used by CLI after consuming)
  if (method === "DELETE") {
    replyStore.delete(nonce);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "cleared" }));
    return true;
  }

  // POST — receive reply from remote gateway
  if (method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST, GET, DELETE");
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
