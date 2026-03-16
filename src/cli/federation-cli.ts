import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { resolveStateDir } from "../config/paths.js";
import { generateOrLoadFederationKeypair } from "../gateway/federation/federation-keypair.js";
import { signMessage } from "../gateway/federation/federation-message.js";
import {
  approvePeer,
  getPeer,
  loadPeers,
  rejectPeer,
  revokePeer,
} from "../gateway/federation/federation-peers.js";
import { danger, info } from "../globals.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import type { GatewayRpcOpts } from "./gateway-rpc.js";
import { addGatewayClientOptions } from "./gateway-rpc.js";

type FederationListOpts = GatewayRpcOpts & { json?: boolean };
type FederationRequestOpts = GatewayRpcOpts & {
  gateway: string;
  scope: string;
  message?: string;
  json?: boolean;
};
type FederationApproveOpts = GatewayRpcOpts & { gatewayId: string; json?: boolean };
type FederationRejectOpts = GatewayRpcOpts & { gatewayId: string; json?: boolean };
type FederationRevokeOpts = GatewayRpcOpts & { gatewayId: string; json?: boolean };
type FederationSendOpts = GatewayRpcOpts & {
  intent: string;
  payload?: string;
  json?: boolean;
};

async function fetchFederationCard(gatewayUrl: string): Promise<unknown> {
  const url = new URL("/.well-known/openclaw-federation", gatewayUrl);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch federation card: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function postFederationRequest(
  gatewayUrl: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL("/federation/request", gatewayUrl);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Federation request failed: ${response.status} ${response.statusText}\n${errorBody}`,
    );
  }
  return await response.json();
}

async function postFederationApprove(
  gatewayUrl: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL("/federation/approve", gatewayUrl);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Federation approve failed: ${response.status} ${response.statusText}\n${errorBody}`,
    );
  }
  return await response.json();
}

export function registerFederationCli(program: Command) {
  const federation = program
    .command("federation")
    .description("Federation management (peer gateways)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/federation", "docs.openclaw.ai/federation")}\n`,
    );

  addGatewayClientOptions(
    federation
      .command("list")
      .description("List all federation peers (pending, approved, rejected)")
      .option("--json", "Output JSON", false),
  ).action(async (opts: FederationListOpts) => {
    try {
      const stateDir = resolveStateDir();
      const peers = await loadPeers(stateDir);
      const peerList = Object.values(peers);

      if (opts.json) {
        defaultRuntime.log(JSON.stringify(peerList, null, 2));
        return;
      }

      if (peerList.length === 0) {
        defaultRuntime.log(info("No federation peers found"));
        return;
      }

      defaultRuntime.log(info(`Federation peers (${peerList.length}):\n`));
      for (const peer of peerList) {
        const statusIcon =
          peer.status === "approved" ? "✅" : peer.status === "rejected" ? "❌" : "⏳";
        // Once approved, show "mutual" — direction of initiation is handshake metadata only
        const direction =
          peer.status === "approved"
            ? "mutual"
            : peer.initiatedBy === "us"
              ? "outbound"
              : "inbound";
        defaultRuntime.log(
          `${statusIcon} ${peer.displayName} (${peer.gatewayId}) - ${peer.status} [${direction}]`,
        );
        defaultRuntime.log(theme.muted(`   URL: ${peer.gatewayUrl}`));
        defaultRuntime.log(theme.muted(`   Scope: ${peer.scope.join(", ")}`));
        defaultRuntime.log(theme.muted(`   Created: ${peer.createdAt}`));
        if (peer.approvedAt) {
          defaultRuntime.log(theme.muted(`   Approved: ${peer.approvedAt}`));
        }
        defaultRuntime.log("");
      }
    } catch (err) {
      defaultRuntime.error(danger(String(err)));
      defaultRuntime.exit(1);
    }
  });

  addGatewayClientOptions(
    federation
      .command("request")
      .description("Initiate a federation request to another gateway")
      .requiredOption("--gateway <url>", "Target gateway URL")
      .requiredOption("--scope <scopes>", "Comma-separated list of requested scopes")
      .option("--message <text>", "Optional message to include with the request")
      .option("--json", "Output JSON", false),
  ).action(async (opts: FederationRequestOpts) => {
    try {
      const stateDir = resolveStateDir();

      // Fetch our own federation card
      const localPort = process.env.OPENCLAW_GATEWAY_PORT ?? "18789";
      const localUrl = `http://localhost:${localPort}`;
      const card = await fetchFederationCard(localUrl);
      if (typeof card !== "object" || card === null) {
        throw new Error("Invalid federation card returned from local gateway");
      }
      const ourCard = card as Record<string, unknown>;

      // Parse scope
      const proposedScope = opts.scope.split(",").map((s) => s.trim());

      // Build request body
      const requestBody = {
        fromGatewayId: ourCard.gatewayId,
        fromDisplayName: ourCard.displayName,
        fromGatewayUrl: localUrl,
        fromPublicKey: ourCard.publicKey,
        proposedScope,
        message: opts.message,
        timestamp: new Date().toISOString(),
        nonce: randomUUID(),
      };

      // Fetch target gateway's federation card to get their real identity
      const targetCard = await fetchFederationCard(opts.gateway);
      const theirCard =
        typeof targetCard === "object" && targetCard !== null
          ? (targetCard as Record<string, unknown>)
          : {};
      const theirGatewayId =
        typeof theirCard.gatewayId === "string" ? theirCard.gatewayId : opts.gateway;
      const theirDisplayName =
        typeof theirCard.displayName === "string" ? theirCard.displayName : opts.gateway;
      const theirPublicKey = typeof theirCard.publicKey === "string" ? theirCard.publicKey : "";

      // Send request to target gateway
      const response = await postFederationRequest(opts.gateway, requestBody);

      // Save as pending peer using their real identity
      const { addPendingPeer } = await import("../gateway/federation/federation-peers.js");
      await addPendingPeer(stateDir, {
        gatewayId: theirGatewayId,
        displayName: theirDisplayName,
        gatewayUrl: opts.gateway,
        publicKey: theirPublicKey,
        scope: proposedScope,
        status: "pending",
        initiatedBy: "us",
        createdAt: new Date().toISOString(),
        nonces: [requestBody.nonce],
      });

      if (opts.json) {
        defaultRuntime.log(JSON.stringify(response, null, 2));
      } else {
        defaultRuntime.log(info("✅ Federation request sent"));
        defaultRuntime.log(theme.muted(`Target: ${opts.gateway}`));
        defaultRuntime.log(theme.muted(`Scope: ${proposedScope.join(", ")}`));
      }
    } catch (err) {
      defaultRuntime.error(danger(String(err)));
      defaultRuntime.exit(1);
    }
  });

  addGatewayClientOptions(
    federation
      .command("approve")
      .description("Approve a pending federation request")
      .argument("<gatewayId>", "Gateway ID to approve")
      .option("--json", "Output JSON", false),
  ).action(async (gatewayId: string, opts: FederationApproveOpts) => {
    try {
      const stateDir = resolveStateDir();

      // Get the peer record
      const peer = await getPeer(stateDir, gatewayId);
      if (!peer) {
        throw new Error(`Peer ${gatewayId} not found`);
      }

      if (peer.status !== "pending") {
        throw new Error(`Peer ${gatewayId} is not pending (status: ${peer.status})`);
      }

      // Approve the peer
      await approvePeer(stateDir, gatewayId);

      // If they initiated, send approval callback
      if (peer.initiatedBy === "them") {
        // Fetch our own federation card
        const localPort = process.env.OPENCLAW_GATEWAY_PORT ?? "18789";
        const localUrl = `http://localhost:${localPort}`;
        const card = await fetchFederationCard(localUrl);
        if (typeof card !== "object" || card === null) {
          throw new Error("Invalid federation card returned from local gateway");
        }
        const ourCard = card as Record<string, unknown>;

        const approvalBody = {
          fromGatewayId: ourCard.gatewayId,
          fromDisplayName: ourCard.displayName,
          fromGatewayUrl: localUrl,
          fromPublicKey: ourCard.publicKey,
          proposedScope: peer.scope,
          timestamp: new Date().toISOString(),
          nonce: randomUUID(),
        };

        // Send approval callback to their /federation/approve endpoint
        // This signals "I approved you" and lets them flip their pending→approved
        await postFederationApprove(peer.gatewayUrl, approvalBody);
      }

      if (opts.json) {
        const updatedPeer = await getPeer(stateDir, gatewayId);
        defaultRuntime.log(JSON.stringify(updatedPeer, null, 2));
      } else {
        defaultRuntime.log(info(`✅ Federation approved: ${peer.displayName} (${gatewayId})`));
      }
    } catch (err) {
      defaultRuntime.error(danger(String(err)));
      defaultRuntime.exit(1);
    }
  });

  addGatewayClientOptions(
    federation
      .command("reject")
      .description("Reject a pending federation request")
      .argument("<gatewayId>", "Gateway ID to reject")
      .option("--json", "Output JSON", false),
  ).action(async (gatewayId: string, opts: FederationRejectOpts) => {
    try {
      const stateDir = resolveStateDir();

      const peer = await getPeer(stateDir, gatewayId);
      if (!peer) {
        throw new Error(`Peer ${gatewayId} not found`);
      }

      await rejectPeer(stateDir, gatewayId);

      if (opts.json) {
        const updatedPeer = await getPeer(stateDir, gatewayId);
        defaultRuntime.log(JSON.stringify(updatedPeer, null, 2));
      } else {
        defaultRuntime.log(info(`❌ Federation rejected: ${peer.displayName} (${gatewayId})`));
      }
    } catch (err) {
      defaultRuntime.error(danger(String(err)));
      defaultRuntime.exit(1);
    }
  });

  addGatewayClientOptions(
    federation
      .command("revoke")
      .description("Revoke an approved federation peer")
      .argument("<gatewayId>", "Gateway ID to revoke")
      .option("--json", "Output JSON", false),
  ).action(async (gatewayId: string, opts: FederationRevokeOpts) => {
    try {
      const stateDir = resolveStateDir();

      const peer = await getPeer(stateDir, gatewayId);
      if (!peer) {
        throw new Error(`Peer ${gatewayId} not found`);
      }

      await revokePeer(stateDir, gatewayId);

      if (opts.json) {
        defaultRuntime.log(JSON.stringify({ status: "revoked", gatewayId }, null, 2));
      } else {
        defaultRuntime.log(info(`🗑️  Federation revoked: ${peer.displayName} (${gatewayId})`));
      }
    } catch (err) {
      defaultRuntime.error(danger(String(err)));
      defaultRuntime.exit(1);
    }
  });

  addGatewayClientOptions(
    federation
      .command("send")
      .description("Send a signed message to an approved federation peer")
      .argument("<gatewayId>", "Gateway ID to send message to")
      .requiredOption("--intent <intent>", "Intent type (ping, web-search)")
      .option("--payload <json>", "JSON payload for the intent")
      .option("--json", "Output JSON", false),
  ).action(async (gatewayId: string, opts: FederationSendOpts) => {
    try {
      const stateDir = resolveStateDir();

      // Get the peer record
      const peer = await getPeer(stateDir, gatewayId);
      if (!peer) {
        throw new Error(`Peer ${gatewayId} not found`);
      }

      if (peer.status !== "approved") {
        throw new Error(`Peer ${gatewayId} is not approved (status: ${peer.status})`);
      }

      // Check intent is in scope
      if (!peer.scope.includes(opts.intent)) {
        throw new Error(`Intent ${opts.intent} not in approved scope: ${peer.scope.join(", ")}`);
      }

      // Parse payload
      let payload: object = {};
      if (opts.payload) {
        try {
          payload = JSON.parse(opts.payload) as object;
        } catch {
          throw new Error("Invalid JSON payload");
        }
      }

      // Load our keypair
      const keypair = await generateOrLoadFederationKeypair(stateDir);

      // Fetch our federation card to get our gateway ID
      const localPort = process.env.OPENCLAW_GATEWAY_PORT ?? "18789";
      const localUrl = `http://localhost:${localPort}`;
      const card = await fetchFederationCard(localUrl);
      if (typeof card !== "object" || card === null) {
        throw new Error("Invalid federation card returned from local gateway");
      }
      const ourCard = card as Record<string, unknown>;
      const ourGatewayId = String(ourCard.gatewayId);

      // Generate nonce for reply
      const nonce = randomUUID();
      const replyTo = `${localUrl}/federation/reply/${nonce}`;

      // Build message payload (everything except signature)
      const timestamp = new Date().toISOString();
      const messagePayload = {
        fromGatewayId: ourGatewayId,
        intent: opts.intent,
        payload,
        replyTo,
        timestamp,
        nonce,
      };

      // Sign the message
      const signature = signMessage(keypair.privateKey, messagePayload);

      // Build full message with signature
      const fullMessage = {
        ...messagePayload,
        signature,
      };

      // Send message to peer
      const messageUrl = new URL("/federation/message", peer.gatewayUrl);
      const response = await fetch(messageUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fullMessage),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Federation message failed: ${response.status} ${response.statusText}\n${errorBody}`,
        );
      }

      const ackResponse = (await response.json()) as unknown;

      if (!opts.json) {
        defaultRuntime.log(info(`📤 Message sent to ${peer.displayName} (${gatewayId})`));
        defaultRuntime.log(theme.muted(`Intent: ${opts.intent}`));
        defaultRuntime.log(theme.muted(`Waiting for reply (30s timeout)...`));
      }

      // Poll for reply on our own gateway
      const { getReply, clearReply } =
        await import("../gateway/federation/federation-message-handler.js");

      const startTime = Date.now();
      const timeoutMs = 30_000;
      let reply: unknown;

      while (Date.now() - startTime < timeoutMs) {
        reply = getReply(nonce);
        if (reply) {
          clearReply(nonce);
          break;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });
      }

      if (!reply) {
        throw new Error("No reply received within 30 seconds");
      }

      if (opts.json) {
        defaultRuntime.log(
          JSON.stringify(
            {
              sent: fullMessage,
              ack: ackResponse,
              reply,
            },
            null,
            2,
          ),
        );
      } else {
        defaultRuntime.log(info("📥 Reply received:"));
        defaultRuntime.log(JSON.stringify(reply, null, 2));
      }
    } catch (err) {
      defaultRuntime.error(danger(String(err)));
      defaultRuntime.exit(1);
    }
  });
}
