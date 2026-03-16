import type { IncomingMessage, ServerResponse } from "node:http";
import type { ResolvedGatewayAuth } from "../auth.js";
import { authorizeHttpGatewayConnect } from "../auth.js";
import { sendGatewayAuthFailure } from "../http-common.js";
import { getBearerToken } from "../http-utils.js";
import { loadPeers, revokePeer } from "./federation-peers.js";

/**
 * Handle GET /federation/peers
 * Returns all peers (authenticated endpoint)
 */
export async function handleFederationPeersList(
  req: IncomingMessage,
  res: ServerResponse,
  stateDir: string,
  auth: ResolvedGatewayAuth,
  trustedProxies: string[],
  allowRealIpFallback: boolean,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  // Verify authentication
  const bearerToken = getBearerToken(req);
  const authResult = await authorizeHttpGatewayConnect({
    auth,
    connectAuth: bearerToken ? { token: bearerToken, password: bearerToken } : null,
    req,
    trustedProxies,
    allowRealIpFallback,
  });

  if (!authResult.ok) {
    sendGatewayAuthFailure(res, authResult);
    return true;
  }

  try {
    const peers = await loadPeers(stateDir);
    const peerList = Object.values(peers);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    if (method === "HEAD") {
      res.end();
    } else {
      res.end(JSON.stringify(peerList));
    }
    return true;
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: String(err) }));
    return true;
  }
}

/**
 * Handle DELETE /federation/peers/:gatewayId
 * Revokes a peer (authenticated endpoint)
 */
export async function handleFederationPeersRevoke(
  req: IncomingMessage,
  res: ServerResponse,
  gatewayId: string,
  stateDir: string,
  auth: ResolvedGatewayAuth,
  trustedProxies: string[],
  allowRealIpFallback: boolean,
): Promise<boolean> {
  const method = (req.method ?? "DELETE").toUpperCase();
  if (method !== "DELETE") {
    res.statusCode = 405;
    res.setHeader("Allow", "DELETE");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  // Verify authentication
  const bearerToken = getBearerToken(req);
  const authResult = await authorizeHttpGatewayConnect({
    auth,
    connectAuth: bearerToken ? { token: bearerToken, password: bearerToken } : null,
    req,
    trustedProxies,
    allowRealIpFallback,
  });

  if (!authResult.ok) {
    sendGatewayAuthFailure(res, authResult);
    return true;
  }

  try {
    await revokePeer(stateDir, gatewayId);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "revoked", gatewayId }));
    return true;
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: String(err) }));
    return true;
  }
}
