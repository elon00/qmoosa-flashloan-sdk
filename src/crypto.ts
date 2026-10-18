import crypto from "node:crypto";
import { AdminActionType, SignedAdminIntent } from "./types.js";

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  return crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
}

export function buildCanonicalPayload(
  action: AdminActionType,
  params: Record<string, any>,
  nonce: number,
  deadline: number,
  domain: string
): string {
  const sortedKeys = Object.keys(params).sort();
  const sortedObj: Record<string, any> = {};
  for (const k of sortedKeys) {
    sortedObj[k] = params[k];
  }
  return JSON.stringify({
    domain,
    action,
    nonce,
    deadline,
    params: sortedObj
  });
}

export function signAdminIntent(
  action: AdminActionType,
  params: Record<string, any>,
  nonce: number,
  deadline: number,
  domain: string,
  privateKeyPem: string
): SignedAdminIntent {
  const payload = buildCanonicalPayload(action, params, nonce, deadline, domain);
  const signature = crypto.sign(null, Buffer.from(payload, "utf8"), privateKeyPem).toString("base64");

  return {
    action,
    params,
    nonce,
    deadline,
    domain,
    signature
  };
}
