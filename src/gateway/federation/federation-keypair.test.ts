import { createPublicKey } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateOrLoadFederationKeypair } from "./federation-keypair.js";

describe("federation-keypair", () => {
  let testDir: string | null = null;

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
      testDir = null;
    }
  });

  it("generates a new keypair on first call", async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-federation-test-"));
    const keypair = await generateOrLoadFederationKeypair(testDir);

    expect(keypair.publicKey).toBeTruthy();
    expect(keypair.privateKey).toBeTruthy();
    expect(typeof keypair.publicKey).toBe("string");
    expect(typeof keypair.privateKey).toBe("string");
  });

  it("loads the same keypair on second call", async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-federation-test-"));

    const keypair1 = await generateOrLoadFederationKeypair(testDir);
    const keypair2 = await generateOrLoadFederationKeypair(testDir);

    expect(keypair1.publicKey).toBe(keypair2.publicKey);
    expect(keypair1.privateKey).toBe(keypair2.privateKey);
  });

  it("generates a valid Ed25519 public key", async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-federation-test-"));
    const keypair = await generateOrLoadFederationKeypair(testDir);

    // Verify the public key can be parsed as Ed25519
    const publicKeyBuffer = Buffer.from(keypair.publicKey, "base64url");
    const publicKeyObj = createPublicKey({
      key: publicKeyBuffer,
      format: "der",
      type: "spki",
    });

    expect(publicKeyObj.asymmetricKeyType).toBe("ed25519");
  });

  it("saves keypair to disk", async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-federation-test-"));
    await generateOrLoadFederationKeypair(testDir);

    const keypairPath = path.join(testDir, "federation-keypair.json");
    const exists = await fs
      .access(keypairPath)
      .then(() => true)
      .catch(() => false);

    expect(exists).toBe(true);
  });
});
