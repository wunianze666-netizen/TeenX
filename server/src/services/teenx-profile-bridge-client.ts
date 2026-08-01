import { createHash, createHmac, randomUUID } from "node:crypto";
import type { z } from "zod";
import type { TeenxProfileConfig } from "./teenx-profile-config.js";

const BRIDGE_PREFIX = "/teenx-profile/bridge/v1";
const MAX_BRIDGE_RESPONSE_BYTES = 256 * 1024;

export class TeenxBridgeHttpError extends Error {
  readonly name = "TeenxBridgeHttpError";

  constructor(readonly status: number) {
    super("TeenX Profile bridge request failed");
  }
}

export class TeenxBridgeProtocolError extends Error {
  readonly name = "TeenxBridgeProtocolError";
}

export type TeenxBridgeRequest = {
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  readonly path: string;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly body?: Readonly<Record<string, unknown>>;
};

export type TeenxBridgeSignature = {
  readonly canonicalPathAndQuery: string;
  readonly canonicalString: string;
  readonly body: string;
  readonly bodySha256: string;
  readonly signature: string;
};

function encodeCanonicalQueryComponent(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints: number[] = [];
  const rightPoints: number[] = [];
  for (const character of left) {
    const point = character.codePointAt(0);
    if (point !== undefined) leftPoints.push(point);
  }
  for (const character of right) {
    const point = character.codePointAt(0);
    if (point !== undefined) rightPoints.push(point);
  }
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftPoint = leftPoints[index];
    const rightPoint = rightPoints[index];
    if (leftPoint === undefined || rightPoint === undefined) break;
    if (leftPoint !== rightPoint) return leftPoint - rightPoint;
  }
  return leftPoints.length - rightPoints.length;
}

function isCanonicalOperationPath(value: string): boolean {
  if (!/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/u.test(value)) return false;
  return !value.split("/").some((segment) => segment === "." || segment === "..");
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_BRIDGE_RESPONSE_BYTES) {
    throw new TeenxBridgeProtocolError("TeenX bridge response exceeded the size limit");
  }
  if (!response.body) throw new TeenxBridgeProtocolError("TeenX bridge returned an empty response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > MAX_BRIDGE_RESPONSE_BYTES) {
        await reader.cancel();
        throw new TeenxBridgeProtocolError("TeenX bridge response exceeded the size limit");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const payload: unknown = JSON.parse(text);
    return payload;
  } catch (error) {
    if (error instanceof TeenxBridgeProtocolError) throw error;
    throw new TeenxBridgeProtocolError("TeenX bridge returned invalid JSON", { cause: error });
  }
}

export type TeenxBridgeClient = {
  request<T>(request: TeenxBridgeRequest, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T>;
};

export function signTeenxBridgeRequest(
  request: TeenxBridgeRequest,
  input: { readonly secret: string; readonly timestamp: number; readonly nonce: string },
): TeenxBridgeSignature {
  if (!isCanonicalOperationPath(request.path)) {
    throw new TeenxBridgeProtocolError("Invalid TeenX bridge operation path");
  }
  const query = Object.entries(request.query ?? {})
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = compareCodePoints(leftKey, rightKey);
      return keyOrder === 0 ? compareCodePoints(leftValue, rightValue) : keyOrder;
    })
    .map(([key, value]) => `${encodeCanonicalQueryComponent(key)}=${encodeCanonicalQueryComponent(value)}`)
    .join("&");
  const canonicalPathAndQuery = `${BRIDGE_PREFIX}${request.path}${query ? `?${query}` : ""}`;
  const body = request.body === undefined ? "" : JSON.stringify(request.body);
  const bodySha256 = createHash("sha256").update(body).digest("hex");
  const canonicalString = [
    request.method,
    canonicalPathAndQuery,
    String(input.timestamp),
    input.nonce,
    bodySha256,
  ].join("\n");
  return {
    canonicalPathAndQuery,
    canonicalString,
    body,
    bodySha256,
    signature: createHmac("sha256", input.secret).update(canonicalString).digest("hex"),
  };
}

export function createTeenxBridgeClient(
  config: TeenxProfileConfig,
  options?: {
    readonly fetch?: typeof fetch;
    readonly now?: () => number;
    readonly nonce?: () => string;
  },
): TeenxBridgeClient {
  if (!config.bridgeBaseUrl) throw new TeenxBridgeProtocolError("TeenX bridge URL is unavailable");
  const bridgeBaseUrl = config.bridgeBaseUrl;
  const fetchImpl = options?.fetch ?? fetch;
  const now = options?.now ?? Date.now;
  const nonceFactory = options?.nonce ?? randomUUID;
  return {
    async request<T>(request: TeenxBridgeRequest, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
      const mutation = request.method !== "GET";
      const timestamp = Math.floor(now() / 1_000);
      const nonce = mutation ? nonceFactory() : "";
      const signed = signTeenxBridgeRequest(request, {
        secret: config.bridgeSecret,
        timestamp,
        nonce,
      });
      const headers = new Headers({
        Accept: "application/json",
        "X-TeenX-Key-Id": config.bridgeKeyId,
        "X-TeenX-Timestamp": String(timestamp),
        "X-TeenX-Body-SHA256": signed.bodySha256,
        "X-TeenX-Signature": signed.signature,
      });
      if (mutation) headers.set("X-TeenX-Nonce", nonce);
      if (signed.body) headers.set("Content-Type", "application/json");
      const response = await fetchImpl(new URL(signed.canonicalPathAndQuery, bridgeBaseUrl), {
        method: request.method,
        headers,
        body: signed.body || undefined,
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(config.bridgeTimeoutMs),
      });
      if (!response.ok) throw new TeenxBridgeHttpError(response.status);
      const payload = await readBoundedJson(response);
      return schema.parse(payload);
    },
  };
}
