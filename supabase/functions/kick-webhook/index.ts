import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KICK_API_URL = "https://api.kick.com/public/v1";
const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KICK_CLIENT_ID = Deno.env.get("KICK_CLIENT_ID")!;
const KICK_CLIENT_SECRET = Deno.env.get("KICK_CLIENT_SECRET")!;
const MUSICASCHAT_SUPABASE_URL = Deno.env.get("MUSICASCHAT_SUPABASE_URL")!;
const MUSICASCHAT_SUPABASE_ANON_KEY = Deno.env.get("MUSICASCHAT_SUPABASE_ANON_KEY")!;
const KICK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbGQmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function musicasChatRest(path: string) {
  return fetch(`${MUSICASCHAT_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: MUSICASCHAT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${MUSICASCHAT_SUPABASE_ANON_KEY}`,
    },
  });
}

let publicKeyPromise: Promise<CryptoKey> | null = null;

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  return base64ToBytes(base64).buffer;
}

async function getPublicKey(): Promise<CryptoKey> {
  if (!publicKeyPromise) {
    publicKeyPromise = crypto.subtle.importKey(
      "spki",
      pemToDer(KICK_PUBLIC_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }
  return publicKeyPromise;
}

async function verifyWebhook(body: string, messageId: string, timestamp: string, signature: string): Promise<boolean> {
  const signed = new TextEncoder().encode(`${messageId}.${timestamp}.${body}`);
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    await getPublicKey(),
    base64ToBytes(signature),
    signed,
  );
}

async function getToken(role: "channel" | "bot") {
  const { data, error } = await supabase
    .from("kick_bot_tokens")
    .select("role, access_token, refresh_token, expires_at")
    .eq("role", role)
    .maybeSingle();
  if (error || !data) throw new Error(`Token Kick ausente para ${role}.`);

  if (new Date(data.expires_at).getTime() > Date.now() + 60_000) return data;

  const response = await fetch(KICK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
      client_id: KICK_CLIENT_ID,
      client_secret: KICK_CLIENT_SECRET,
    }),
  });
  const refreshed = await response.json();
  if (!response.ok || !refreshed.access_token || !refreshed.refresh_token) {
    console.error("Kick refresh failed", response.status, refreshed);
    throw new Error(`Não foi possível renovar o token Kick de ${role}.`);
  }

  const updated = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: new Date(Date.now() + Number(refreshed.expires_in ?? 3600) * 1000).toISOString(),
    scope: refreshed.scope ?? null,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("kick_bot_tokens").update(updated).eq("role", role);
  return { ...data, ...updated };
}

async function sendBotMessage(content: string) {
  const token = await getToken("bot");
  const response = await fetch(`${KICK_API_URL}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: content.slice(0, 500), type: "bot" }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("Kick bot send failed", response.status, data);
    throw new Error("A Kick recusou a mensagem do bot.");
  }
}

async function allowResponse(): Promise<boolean> {
  const now = Date.now();
  const { data } = await supabase
    .from("kick_bot_rate_limit")
    .select("last_sent_at")
    .eq("id", true)
    .maybeSingle();
  const last = data?.last_sent_at ? new Date(data.last_sent_at).getTime() : 0;
  if (now - last < 1500) return false;
  await supabase
    .from("kick_bot_rate_limit")
    .update({ last_sent_at: new Date(now).toISOString() })
    .eq("id", true);
  return true;
}

function shorten(value: string, max = 70) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

async function commandResponse(command: string): Promise<string | null> {
  if (command === "!musica") {
    const response = await musicasChatRest(
      "player_queue?select=title,author,track_id&status=eq.playing&order=state_updated_at.desc&limit=1",
    );
    const data = await response.json();
    if (!response.ok) throw new Error(`MusicasChatt REST ${response.status}`);
    const item = data?.[0];
    if (!item) return "🎵 Nenhuma música tocando agora.";
    const title = shorten(item.title ?? `YouTube ${item.track_id}`);
    const author = item.author ? ` — ${shorten(item.author, 45)}` : "";
    return `🎵 Tocando agora: ${title}${author}`;
  }

  if (command === "!fila") {
    const response = await musicasChatRest(
      "player_queue?select=title,author,track_id,priority&status=eq.queued&order=priority.desc,position.asc,id.asc&limit=5",
    );
    const data = await response.json();
    if (!response.ok) throw new Error(`MusicasChatt REST ${response.status}`);
    if (!data?.length) return "📋 A fila está vazia.";
    const items = data.map((item: { title?: string; track_id?: string; priority?: number }, index: number) => {
      const title = shorten(item.title ?? `YouTube ${item.track_id}`, 52);
      return `${index + 1}. ${item.priority ? "★ " : ""}${title}`;
    });
    return `📋 Próximas: ${items.join(" • ")}`;
  }

  if (command === "!help") {
    return "🤖 Comandos: !musica • !fila • !help";
  }

  return null;
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return new Response("OK", { status: 200 });

    const body = await request.text();
    const messageId = request.headers.get("Kick-Event-Message-Id") ?? "";
    const timestamp = request.headers.get("Kick-Event-Message-Timestamp") ?? "";
    const signature = request.headers.get("Kick-Event-Signature") ?? "";
    const eventType = request.headers.get("Kick-Event-Type") ?? "";

    if (eventType !== "chat.message.sent") return new Response("OK", { status: 200 });
    if (!messageId || !timestamp || !signature) return new Response("Missing signature", { status: 400 });

    const valid = await verifyWebhook(body, messageId, timestamp, signature);
    if (!valid) return new Response("Invalid signature", { status: 401 });

    const { data: inserted } = await supabase
      .from("kick_bot_seen_events")
      .insert({ message_id: messageId })
      .select("message_id")
      .maybeSingle();
    if (!inserted) return new Response("OK", { status: 200 });

    const payload = JSON.parse(body) as { content?: string };
    const command = payload.content?.trim().toLowerCase() ?? "";
    const response = await commandResponse(command);
    if (!response) return new Response("OK", { status: 200 });

    if (await allowResponse()) await sendBotMessage(response);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("kick-webhook error", error);
    return new Response("OK", { status: 200 });
  }
});
