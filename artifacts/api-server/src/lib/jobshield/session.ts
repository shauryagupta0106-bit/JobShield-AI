import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response } from "express";

const COOKIE_NAME = "jobshield_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function signature(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

function equalSignature(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function readCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== COOKIE_NAME) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function getAnonymousSessionHash(
  request: Request,
  response: Response,
): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  const cookieValue = readCookie(request);
  if (cookieValue) {
    const separator = cookieValue.lastIndexOf(".");
    if (separator > 0) {
      const token = cookieValue.slice(0, separator);
      const actualSignature = cookieValue.slice(separator + 1);
      if (
        /^[A-Za-z0-9_-]{40,60}$/.test(token) &&
        equalSignature(actualSignature, signature(token, secret))
      ) {
        return createHash("sha256").update(token).digest("hex");
      }
    }
  }

  const token = randomBytes(32).toString("base64url");
  const signedValue = `${token}.${signature(token, secret)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(signedValue)}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`,
  );
  return createHash("sha256").update(token).digest("hex");
}
