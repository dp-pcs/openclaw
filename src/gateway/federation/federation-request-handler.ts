import type { IncomingMessage, ServerResponse } from "node:http";
import { requestHeartbeatNow } from "../../infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { readJsonBody } from "../hooks.js";
import { MAX_PREAUTH_PAYLOAD_BYTES } from "../server-constants.js";
import { addPendingPeer, hasNonce, recordNonce, type PeerRecord } from "./federation-peers.js";

type FederationRequestBody = {
  fromGatewayId: string;
  fromDisplayName: string;
  fromGatewayUrl: string;
  fromPublicKey: string;
  fromEmail?: string; // Only shared during trust establishment, never on public well-known
  proposedScope: string[];
  message?: string;
  timestamp: string;
  nonce: string;
};

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
 * Validate a federation request body
 */
function validateFederationRequest(body: unknown): body is FederationRequestBody {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const req = body as Record<string, unknown>;
  return (
    typeof req.fromGatewayId === "string" &&
    typeof req.fromDisplayName === "string" &&
    typeof req.fromGatewayUrl === "string" &&
    typeof req.fromPublicKey === "string" &&
    Array.isArray(req.proposedScope) &&
    req.proposedScope.every((s) => typeof s === "string") &&
    typeof req.timestamp === "string" &&
    typeof req.nonce === "string"
  );
}

/**
 * Handle POST /federation/request
 * Receives inbound federation requests from other gateways
 */
export async function handleFederationRequest(
  req: IncomingMessage,
  res: ServerResponse,
  stateDir: string,
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
    if (!validateFederationRequest(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Invalid request body" }));
      return true;
    }

    // Validate timestamp
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

    // Create pending peer record — email stored here, never on public well-known
    const peerRecord: PeerRecord = {
      gatewayId: body.fromGatewayId,
      displayName: body.fromDisplayName,
      ...(body.fromEmail ? { email: body.fromEmail } : {}),
      gatewayUrl: body.fromGatewayUrl,
      publicKey: body.fromPublicKey,
      scope: body.proposedScope,
      status: "pending",
      initiatedBy: "them",
      createdAt: new Date().toISOString(),
      nonces: [body.nonce],
    };

    await addPendingPeer(stateDir, peerRecord);

    // Send notification to gateway owner via heartbeat wake
    const scopeList = body.proposedScope.join(", ");
    const notificationText = `🤝 Federation request from ${body.fromDisplayName} (${body.fromGatewayId})\nProposed scope: ${scopeList}\n\nReply with: openclaw federation approve ${body.fromGatewayId}\nor: openclaw federation reject ${body.fromGatewayId}`;

    // Use requestHeartbeatNow to trigger a notification
    requestHeartbeatNow({
      reason: `federation-request:${body.fromGatewayId}`,
      coalesceMs: 0,
    });

    // Also enqueue as a system event for any active sessions
    // This ensures the notification appears in the next prompt
    try {
      enqueueSystemEvent(notificationText, {
        sessionKey: "gateway-system",
        contextKey: "federation",
      });
    } catch {
      // If no active session, the heartbeat will still deliver notification
    }

    res.statusCode = 202;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "pending" }));
    return true;
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: String(err) }));
    return true;
  }
}

/**
 * Handle POST /federation/approve
 * Receives approval callbacks from other gateways
 */
export async function handleFederationApprove(
  req: IncomingMessage,
  res: ServerResponse,
  stateDir: string,
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
    if (!validateFederationRequest(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Invalid request body" }));
      return true;
    }

    // Validate timestamp
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

    // Record the nonce
    await recordNonce(stateDir, body.fromGatewayId, body.nonce);

    // Find matching outbound pending peer and approve it
    // (This is the callback from the remote gateway saying "I approved your request")
    const { loadPeers, savePeers } = await import("./federation-peers.js");
    const peers = await loadPeers(stateDir);
    const outboundPeer = Object.values(peers).find(
      (p) =>
        (p.initiatedBy === "us" && p.gatewayUrl === body.fromGatewayUrl) ||
        (p.initiatedBy === "us" && p.gatewayId === body.fromGatewayId),
    );
    if (outboundPeer) {
      outboundPeer.status = "approved";
      outboundPeer.approvedAt = new Date().toISOString();
      outboundPeer.publicKey = String(body.fromPublicKey ?? outboundPeer.publicKey);
      // Store their email from the approval callback — only shared post-trust
      if (body.fromEmail && !outboundPeer.email) {
        outboundPeer.email = body.fromEmail;
      }
      await savePeers(stateDir, peers);
    }

    // Send notification about approval
    const notificationText = `✅ Federation approved by ${body.fromDisplayName} (${body.fromGatewayId})`;
    requestHeartbeatNow({
      reason: `federation-approved:${body.fromGatewayId}`,
      coalesceMs: 0,
    });

    try {
      enqueueSystemEvent(notificationText, {
        sessionKey: "gateway-system",
        contextKey: "federation",
      });
    } catch {
      // If no active session, the heartbeat will still deliver notification
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "approved" }));
    return true;
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: String(err) }));
    return true;
  }
}
