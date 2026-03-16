import { sign, verify, createPrivateKey, createPublicKey } from "node:crypto";

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
  // privateKey is base64url-encoded DER (PKCS8) — import as KeyObject
  const keyBuffer = Buffer.from(privateKey, "base64url");
  const keyObject = createPrivateKey({ key: keyBuffer, format: "der", type: "pkcs8" });

  // Create canonical JSON representation
  const canonical = canonicalizeJson(payload);

  // Ed25519 requires one-shot sign() not createSign() in Node v25+
  const signature = sign(null, Buffer.from(canonical), keyObject);
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

    // Ed25519 requires one-shot verify() not createVerify() in Node v25+
    const keyObject = createPublicKey({ key: keyBuffer, format: "der", type: "spki" });
    return verify(null, Buffer.from(canonical), keyObject, signatureBuffer);
  } catch {
    return false;
  }
}
