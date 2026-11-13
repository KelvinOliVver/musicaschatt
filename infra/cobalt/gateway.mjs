import http from "node:http";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";

// The only public listener is this gateway. Cobalt itself is bound to
// 127.0.0.1 and its API key never reaches a browser or GitHub.
const port = Number(process.env.PORT || "10000");
const upstream = "http://127.0.0.1:" + String(process.env.API_PORT || "10001");
const publicOrigin = "https://musicaschatt-cobalt.onrender.com";
const allowedOrigins = new Set(["https://musicaschatt.lovable.app"]);
const authBase = process.env.SUPABASE_URL?.replace(/\/$/, "");
const authApiKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const cobaltKey = process.env.COBALT_API_KEY;
const quotas = new Map();
let terminating = false;

if (!cobaltKey || !authBase || !authApiKey ||
    !/^https:\/\/[a-z0-9-]+\.(lovable\.cloud|supabase\.co)$/.test(authBase)) {
  throw new Error("Missing/invalid Cobalt or Supabase environment variables");
}

const child = spawn(process.execPath, ["src/cobalt"], {
  cwd: "/app",
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  console.error("Cobalt exited", code, signal);
  if (!terminating) process.exit(code || 1);
});

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    return true;
  }
  return !origin;
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

async function bodyJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk.toString("utf8");
    if (raw.length > 4096) throw new Error("body too large");
  }
  return JSON.parse(raw || "{}");
}

async function authenticatedUser(req) {
  const auth = String(req.headers.authorization || "");
  if (!/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(auth) || auth.length > 4096) return null;
  try {
    const result = await fetch(authBase + "/auth/v1/user", {
      headers: { authorization: auth, apikey: authApiKey },
      redirect: "error",
      signal: AbortSignal.timeout(6000),
    });
    if (!result.ok) return null;
    const user = await result.json();
    return typeof user.id === "string" && /^[0-9a-f-]{36}$/i.test(user.id) ? user.id : null;
  } catch {
    return null;
  }
}

function withinQuota(id) {
  const now = Date.now();
  if (quotas.size > 500) {
    for (const [key, entry] of quotas) if (entry.until < now) quotas.delete(key);
  }
  const item = quotas.get(id) || { count: 0, until: now + 60000 };
  if (item.until < now) { item.count = 0; item.until = now + 60000; }
  item.count++;
  quotas.set(id, item);
  return item.count <= 8;
}

function acceptableVideoUrl(raw) {
  if (typeof raw !== "string" || raw.length > 8192) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (u.origin === publicOrigin && u.pathname === "/tunnel") return u.href;
    if (host === "fbcdn.net" || host.endsWith(".fbcdn.net") ||
        host === "cdninstagram.com" || host.endsWith(".cdninstagram.com")) return u.href;
  } catch {}
  return null;
}

async function resolve(req, res) {
  if (!cors(req, res)) return json(res, 403, { error: "origin_not_allowed" });
  const userId = await authenticatedUser(req);
  if (!userId) return json(res, 401, { error: "login_required" });
  if (!withinQuota(userId)) return json(res, 429, { error: "rate_limited" });

  let input;
  try { input = await bodyJson(req); }
  catch { return json(res, 400, { error: "invalid_json" }); }
  const kind = input?.kind;
  const trackId = input?.trackId;
  if (!["reel", "p", "tv"].includes(kind) ||
      typeof trackId !== "string" || !/^[\w-]{5,40}$/.test(trackId)) {
    return json(res, 400, { error: "invalid_instagram_link" });
  }

  const url = `https://www.instagram.com/${kind}/${encodeURIComponent(trackId)}/`;
  try {
    const result = await fetch(upstream + "/", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(9000),
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": "Api-Key " + cobaltKey,
      },
      body: JSON.stringify({
        url,
        downloadMode: "auto",
        videoQuality: "720",
        alwaysProxy: true,
        localProcessing: "disabled",
      }),
    });
    const type = result.headers.get("content-type") || "";
    if (!result.ok || !type.includes("application/json")) {
      return json(res, 200, { url: null, status: "unavailable" });
    }
    const response = await result.json();
    const playable = ["tunnel", "redirect"].includes(response?.status)
      ? acceptableVideoUrl(response?.url) : null;
    return json(res, 200, { url: playable, status: playable ? "ready" : "unavailable" });
  } catch {
    return json(res, 200, { url: null, status: "unavailable" });
  }
}

async function tunnel(req, res) {
  if (req.url.length > 4096) return json(res, 414, { error: "invalid_tunnel" });
  const u = new URL(req.url, upstream);
  if (u.pathname !== "/tunnel" || !u.search) return json(res, 404, { error: "not_found" });

  const aborter = new AbortController();
  res.on("close", () => { if (!res.writableEnded) aborter.abort(); });
  try {
    const headers = {};
    if (req.headers.range) headers.Range = String(req.headers.range).slice(0, 150);
    const upstreamResponse = await fetch(upstream + u.pathname + u.search, {
      method: req.method,
      headers,
      redirect: "manual",
      signal: aborter.signal,
    });
    // Do not forward arbitrary upstream redirects. The validated tunnel token
    // is enough for Cobalt to return media directly, or a permitted CDN URL.
    if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      const location = acceptableVideoUrl(upstreamResponse.headers.get("location"));
      if (!location) return json(res, 502, { error: "invalid_media_redirect" });
      res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
      return res.end();
    }
    const safeHeaders = {};
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"]) {
      const value = upstreamResponse.headers.get(key);
      if (value) safeHeaders[key] = value;
    }
    res.writeHead(upstreamResponse.status, safeHeaders);
    if (!upstreamResponse.body || req.method === "HEAD") return res.end();
    Readable.fromWeb(upstreamResponse.body).on("error", () => res.destroy()).pipe(res);
  } catch {
    if (!res.headersSent) json(res, 502, { error: "tunnel_unavailable" });
    else res.destroy();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    if (req.method === "GET" && (pathname === "/" || pathname === "/healthz")) {
      return json(res, 200, { ok: true, service: "music-chat-media-gateway" });
    }
    if (req.method === "OPTIONS" && pathname === "/resolve") {
      if (!cors(req, res)) return json(res, 403, { error: "origin_not_allowed" });
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
      });
      return res.end();
    }
    if (req.method === "POST" && pathname === "/resolve") return await resolve(req, res);
    if (["GET", "HEAD"].includes(req.method) && pathname === "/tunnel") return await tunnel(req, res);
    return json(res, 404, { error: "not_found" });
  } catch {
    if (!res.headersSent) json(res, 500, { error: "internal_error" });
    else res.destroy();
  }
});
server.listen(port, "0.0.0.0", () => console.log("Media gateway ready on port", port));

function shutdown() {
  if (terminating) return;
  terminating = true;
  child.kill("SIGTERM");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
