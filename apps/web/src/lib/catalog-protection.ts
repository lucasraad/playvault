import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

const VISITOR_COOKIE = "pv_catalog_visitor";
const VISITOR_LIMIT = 10;
const VISITOR_WINDOW_MS = 60_000;
const RATE_LIMIT_SCRIPT = `
local now_parts = redis.call('TIME')
local now = (tonumber(now_parts[1]) * 1000) + math.floor(tonumber(now_parts[2]) / 1000)
local cutoff = now - tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, cutoff)
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[2]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, math.max(1, tonumber(oldest[2]) + tonumber(ARGV[1]) - now)}
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
return {1, 0}
`.trim();

interface LocalWindow {
  timestamps: number[];
}

export interface CatalogVisitor {
  signedId: string;
  isNew: boolean;
}

export interface CatalogRateLimitDecision {
  allowed: boolean;
  retryAfter: number;
}

export class CatalogProtectionUnavailable extends Error {}

const localWindows = new Map<string, LocalWindow>();

export function getCatalogVisitor(request: NextRequest): CatalogVisitor {
  const secret = visitorSecret();
  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  if (existing && verifySignedVisitor(existing, secret)) {
    return { signedId: existing, isNew: false };
  }
  const visitorId = randomUUID().replaceAll("-", "");
  return { signedId: signVisitor(visitorId, secret), isNew: true };
}

export async function checkCatalogVisitorRateLimit(
  signedId: string,
): Promise<CatalogRateLimitDecision> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && redisToken) {
    return sharedRateLimit(redisUrl, redisToken, signedId);
  }
  if (process.env.NODE_ENV === "production") {
    throw new CatalogProtectionUnavailable("Shared catalog protection is not configured");
  }
  return localRateLimit(signedId);
}

export function setCatalogVisitorCookie(response: NextResponse, visitor: CatalogVisitor): void {
  if (!visitor.isNew) return;
  response.cookies.set(VISITOR_COOKIE, visitor.signedId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/catalog",
    maxAge: 60 * 60 * 24 * 365,
  });
}

async function sharedRateLimit(
  redisUrl: string,
  redisToken: string,
  signedId: string,
): Promise<CatalogRateLimitDecision> {
  const visitorId = signedId.slice(0, 32);
  let response: Response;
  try {
    response = await fetch(redisUrl.replace(/\/$/, ""), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        "EVAL",
        RATE_LIMIT_SCRIPT,
        1,
        `playvault:catalog:bff:visitor:${visitorId}`,
        VISITOR_WINDOW_MS,
        VISITOR_LIMIT,
        randomUUID(),
      ]),
      cache: "no-store",
    });
  } catch (error) {
    throw new CatalogProtectionUnavailable("Catalog protection store unavailable", {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new CatalogProtectionUnavailable("Catalog protection store unavailable");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload) || !Array.isArray(payload.result) || payload.result.length !== 2) {
    throw new CatalogProtectionUnavailable("Invalid catalog protection response");
  }
  const [allowed, retryAfterMs] = payload.result;
  if (!Number.isInteger(allowed) || !Number.isInteger(retryAfterMs)) {
    throw new CatalogProtectionUnavailable("Invalid catalog protection response");
  }
  return { allowed: allowed === 1, retryAfter: Number(retryAfterMs) / 1000 };
}

function localRateLimit(signedId: string): CatalogRateLimitDecision {
  const now = Date.now();
  const window = localWindows.get(signedId) ?? { timestamps: [] };
  window.timestamps = window.timestamps.filter((timestamp) => timestamp > now - VISITOR_WINDOW_MS);
  localWindows.set(signedId, window);
  if (window.timestamps.length >= VISITOR_LIMIT) {
    return {
      allowed: false,
      retryAfter: Math.max(0.001, (window.timestamps[0] + VISITOR_WINDOW_MS - now) / 1000),
    };
  }
  window.timestamps.push(now);
  return { allowed: true, retryAfter: 0 };
}

function visitorSecret(): string {
  const configured = process.env.CATALOG_VISITOR_SECRET;
  if (configured && (process.env.NODE_ENV !== "production" || configured.length >= 32)) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new CatalogProtectionUnavailable("Catalog visitor signing is not configured");
  }
  return "playvault-development-only-catalog-secret";
}

function signVisitor(visitorId: string, secret: string): string {
  return `${visitorId}.${createHmac("sha256", secret).update(visitorId).digest("hex")}`;
}

function verifySignedVisitor(value: string, secret: string): boolean {
  const [visitorId, signature, extra] = value.split(".");
  if (extra !== undefined || !visitorId || !signature || !/^[a-f0-9]{32}$/.test(visitorId)) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(visitorId).digest("hex");
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
