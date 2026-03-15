import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type FederationKeypair = {
  publicKey: string;
  privateKey: string;
};

const KEYPAIR_FILENAME = "federation-keypair.json";

/**
 * Generate a new Ed25519 keypair for federation
 */
function generateFederationKeypair(): FederationKeypair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: {
      type: "spki",
      format: "der",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "der",
    },
  });

  return {
    publicKey: publicKey.toString("base64url"),
    privateKey: privateKey.toString("base64url"),
  };
}

/**
 * Load keypair from disk if exists
 */
async function loadKeypair(stateDir: string): Promise<FederationKeypair | null> {
  const keypairPath = path.join(stateDir, KEYPAIR_FILENAME);
  try {
    const content = await fs.readFile(keypairPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "publicKey" in parsed &&
      "privateKey" in parsed &&
      typeof parsed.publicKey === "string" &&
      typeof parsed.privateKey === "string"
    ) {
      return {
        publicKey: parsed.publicKey,
        privateKey: parsed.privateKey,
      };
    }
    return null;
  } catch (err) {
    const anyErr = err as { code?: string };
    if (anyErr.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Save keypair to disk
 */
async function saveKeypair(stateDir: string, keypair: FederationKeypair): Promise<void> {
  const keypairPath = path.join(stateDir, KEYPAIR_FILENAME);
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(keypairPath, JSON.stringify(keypair, null, 2), { mode: 0o600 });
}

/**
 * Generate or load the federation keypair.
 * If a keypair exists on disk, load and return it.
 * Otherwise, generate a new one, save it, and return it.
 */
export async function generateOrLoadFederationKeypair(
  stateDir: string,
): Promise<FederationKeypair> {
  const existing = await loadKeypair(stateDir);
  if (existing) {
    return existing;
  }

  const newKeypair = generateFederationKeypair();
  await saveKeypair(stateDir, newKeypair);
  return newKeypair;
}
