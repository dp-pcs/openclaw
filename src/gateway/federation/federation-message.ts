import { createSign, createVerify } from "node:crypto";

/**
 * Canonicalize JSON payload for signing
 * Sorts keys recursively to ensure deterministic serialization
 */
function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalizeJson(item)).join(",")}]`;
  }

  const sorted = Object.keys(obj)
    .toSorted()
    .map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${canonicalizeJson(value)}`;
    })
    .join(",");

  return `{${sorted}}`;
}

/**
 * Sign a message payload with Ed25519 private key
 * Returns base64url-encoded signature
 */
export function signMessage(privateKey: string, payload: object): string {
  // Deserialize the base64url-encoded DER private key
  const keyBuffer = Buffer.from(privateKey, "base64url");

  // Create canonical JSON representation
  const canonical = canonicalizeJson(payload);

  // Sign with Ed25519
  const sign = createSign("SHA512");
  sign.update(canonical);
  sign.end();

  const signature = sign.sign({
    key: keyBuffer,
    format: "der",
    type: "pkcs8",
  });

  return signature.toString("base64url");
}

/**
 * Verify a message signature with Ed25519 public key
 * Returns true if signature is valid, false otherwise
 */
export function verifyMessage(publicKey: string, payload: object, signature: string): boolean {
  try {
    // Deserialize the base64url-encoded DER public key
    const keyBuffer = Buffer.from(publicKey, "base64url");
    const signatureBuffer = Buffer.from(signature, "base64url");

    // Create canonical JSON representation
    const canonical = canonicalizeJson(payload);

    // Verify with Ed25519
    const verify = createVerify("SHA512");
    verify.update(canonical);
    verify.end();

    return verify.verify(
      {
        key: keyBuffer,
        format: "der",
        type: "spki",
      },
      signatureBuffer,
    );
  } catch {
    return false;
  }
}
