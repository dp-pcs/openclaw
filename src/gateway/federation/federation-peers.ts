import fs from "node:fs/promises";
import path from "node:path";

export type PeerStatus = "pending" | "approved" | "rejected";
export type PeerInitiator = "us" | "them";

export type PeerRecord = {
  gatewayId: string;
  displayName: string;
  gatewayUrl: string;
  publicKey: string;
  scope: string[];
  status: PeerStatus;
  initiatedBy: PeerInitiator;
  createdAt: string;
  approvedAt?: string;
  nonces: string[];
};

type PeerRecordMap = Record<string, PeerRecord>;

const PEERS_FILENAME = "federation-peers.json";
const MAX_NONCES = 100;

/**
 * Load all peers from disk
 */
export async function loadPeers(stateDir: string): Promise<PeerRecordMap> {
  const peersPath = path.join(stateDir, PEERS_FILENAME);
  try {
    const content = await fs.readFile(peersPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as PeerRecordMap;
    }
    return {};
  } catch (err) {
    const anyErr = err as { code?: string };
    if (anyErr.code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

/**
 * Save all peers to disk
 */
export async function savePeers(stateDir: string, peers: PeerRecordMap): Promise<void> {
  const peersPath = path.join(stateDir, PEERS_FILENAME);
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(peersPath, JSON.stringify(peers, null, 2), { mode: 0o600 });
}

/**
 * Add a pending peer to the store
 */
export async function addPendingPeer(stateDir: string, peer: PeerRecord): Promise<void> {
  const peers = await loadPeers(stateDir);
  peers[peer.gatewayId] = peer;
  await savePeers(stateDir, peers);
}

/**
 * Approve a pending peer
 */
export async function approvePeer(stateDir: string, gatewayId: string): Promise<void> {
  const peers = await loadPeers(stateDir);
  const peer = peers[gatewayId];
  if (!peer) {
    throw new Error(`Peer ${gatewayId} not found`);
  }
  peer.status = "approved";
  peer.approvedAt = new Date().toISOString();
  await savePeers(stateDir, peers);
}

/**
 * Reject a pending peer
 */
export async function rejectPeer(stateDir: string, gatewayId: string): Promise<void> {
  const peers = await loadPeers(stateDir);
  const peer = peers[gatewayId];
  if (!peer) {
    throw new Error(`Peer ${gatewayId} not found`);
  }
  peer.status = "rejected";
  await savePeers(stateDir, peers);
}

/**
 * Revoke an approved peer
 */
export async function revokePeer(stateDir: string, gatewayId: string): Promise<void> {
  const peers = await loadPeers(stateDir);
  delete peers[gatewayId];
  await savePeers(stateDir, peers);
}

/**
 * Get a peer by gatewayId
 */
export async function getPeer(stateDir: string, gatewayId: string): Promise<PeerRecord | null> {
  const peers = await loadPeers(stateDir);
  return peers[gatewayId] ?? null;
}

/**
 * Record a nonce for a peer to prevent replay attacks
 */
export async function recordNonce(
  stateDir: string,
  gatewayId: string,
  nonce: string,
): Promise<void> {
  const peers = await loadPeers(stateDir);
  const peer = peers[gatewayId];
  if (!peer) {
    throw new Error(`Peer ${gatewayId} not found`);
  }
  peer.nonces.unshift(nonce);
  if (peer.nonces.length > MAX_NONCES) {
    peer.nonces.splice(MAX_NONCES);
  }
  await savePeers(stateDir, peers);
}

/**
 * Check if a nonce has been seen for a peer
 */
export async function hasNonce(
  stateDir: string,
  gatewayId: string,
  nonce: string,
): Promise<boolean> {
  const peer = await getPeer(stateDir, gatewayId);
  if (!peer) {
    return false;
  }
  return peer.nonces.includes(nonce);
}
