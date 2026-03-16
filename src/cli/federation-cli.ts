import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { resolveStateDir } from "../config/paths.js";
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
        const initiator = peer.initiatedBy === "us" ? "outbound" : "inbound";
        defaultRuntime.log(
          `${statusIcon} ${peer.displayName} (${peer.gatewayId}) - ${peer.status} [${initiator}]`,
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
      const card = await fetchFederationCard("http://localhost:18789");
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
        fromGatewayUrl: "http://localhost:18789", // TODO: should be configurable
        fromPublicKey: ourCard.publicKey,
        proposedScope,
        message: opts.message,
        timestamp: new Date().toISOString(),
        nonce: randomUUID(),
      };

      // Send request to target gateway
      const response = await postFederationRequest(opts.gateway, requestBody);

      // Save as pending peer
      const { addPendingPeer } = await import("../gateway/federation/federation-peers.js");
      await addPendingPeer(stateDir, {
        gatewayId: String(opts.gateway), // We'll use the URL as gatewayId for now
        displayName: String(opts.gateway),
        gatewayUrl: opts.gateway,
        publicKey: "", // We'll get this from their response or well-known
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
        const card = await fetchFederationCard("http://localhost:18789");
        if (typeof card !== "object" || card === null) {
          throw new Error("Invalid federation card returned from local gateway");
        }
        const ourCard = card as Record<string, unknown>;

        const approvalBody = {
          fromGatewayId: ourCard.gatewayId,
          fromDisplayName: ourCard.displayName,
          fromGatewayUrl: "http://localhost:18789",
          fromPublicKey: ourCard.publicKey,
          proposedScope: peer.scope,
          timestamp: new Date().toISOString(),
          nonce: randomUUID(),
        };

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
}
