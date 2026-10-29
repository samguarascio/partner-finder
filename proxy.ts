import { NextResponse, type NextRequest } from "next/server";

// Protection for a shared deployment, so a public link can't burn API credits.
// - APP_PASSWORD set: the browser asks for a password (any username works).
// - API calls are rate limited per IP. The limits are per server instance,
//   which is enough to stop casual abuse, not a determined attacker.

const WINDOW_MS = 10 * 60 * 1000;
const LIMITS: Record<string, number> = {
  "/api/partners": 20, // each call runs up to 18 searches and a long Claude call
  default: 120,
};

const hits = new Map<string, number[]>();

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

// Returns seconds until the caller may retry, or 0 if the call is allowed.
function rateLimit(req: NextRequest): number {
  const path = req.nextUrl.pathname;
  const limit = LIMITS[path] ?? LIMITS.default;
  const key = `${clientIp(req)} ${path in LIMITS ? path : "default"}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return Math.ceil((recent[0] + WINDOW_MS - now) / 1000);
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, times] of hits) if (now - times[times.length - 1] > WINDOW_MS) hits.delete(k);
  }
  return 0;
}

function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function passwordOk(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    return safeEqual(decoded.slice(decoded.indexOf(":") + 1), password);
  } catch {
    return false;
  }
}

export function proxy(req: NextRequest) {
  if (!passwordOk(req)) {
    return new NextResponse("Password required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Partner Finder", charset="UTF-8"' },
    });
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    const retryAfter = rateLimit(req);
    if (retryAfter) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
