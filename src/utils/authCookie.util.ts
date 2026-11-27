import { CookieOptions, Response } from "express";

/** Cookie httpOnly para auth (dual con Bearer durante la migración). */
export const AUTH_COOKIE_NAME = "pcinbox_auth";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function cookieOptions(): CookieOptions {
  // Acepta production | prod | qa (VPS). Solo local/dev usa lax sin Secure.
  const env = String(process.env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  const isLocal =
    !env || env === "local" || env === "development" || env === "dev";
  const crossSite = !isLocal;
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "lax",
    maxAge: THREE_DAYS_MS,
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...cookieOptions(),
    maxAge: 0,
  });
}

/** Bearer header primero; si no, cookie httpOnly. */
export function extractAuthToken(req: {
  headers: { authorization?: string };
  cookies?: Record<string, string | undefined>;
}): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    if (bearer && bearer !== "null" && bearer !== "undefined" && bearer !== "false") {
      return bearer;
    }
  }

  const fromCookie = req.cookies?.[AUTH_COOKIE_NAME];
  if (
    fromCookie &&
    fromCookie !== "null" &&
    fromCookie !== "undefined" &&
    fromCookie !== "false"
  ) {
    return fromCookie;
  }

  return null;
}
