import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KICK_AUTHORIZE_URL = "https://id.kick.com/oauth/authorize";
const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
const KICK_API_URL = "https://api.kick.com/public/v1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KICK_CLIENT_ID = Deno.env.get("KICK_CLIENT_ID")!;
const KICK_CLIENT_SECRET = Deno.env.get("KICK_CLIENT_SECRET")!;
const KICK_REDIRECT_URI = Deno.env.get("KICK_REDIRECT_URI")!;
const KICK_WEBHOOK_URL = Deno.env.get("KICK_WEBHOOK_URL")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function html(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:680px;padding:32px"><h1>${title}</h1><p>${body}</p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } },
  );
}

function randomVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function redirectUrl(role: "channel" | "bot") {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: KICK_CLIENT_ID,
    redirect_uri: KICK_REDIRECT_URI,
    scope: role === "channel" ? "user:read events:subscribe" : "user:read chat:write",
    state: "",
    code_challenge: "",
    code_challenge_method: "S256",
  });
  return params;
}

async function startOAuth(role: "channel" | "bot") {
  if (!KICK_CLIENT_ID || !KICK_REDIRECT_URI) {
    return html("Kick OAuth não configurado", "Defina KICK_CLIENT_ID e KICK_REDIRECT_URI nos secrets da Edge Function.", 500);
  }

  const state = crypto.randomUUID();
  const codeVerifier = randomVerifier();
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const { error } = await supabase.from("kick_oauth_states").insert({
    state,
    role,
    code_verifier: codeVerifier,
  });
  if (error) return html("Erro ao iniciar OAuth", "Não foi possível salvar o estado seguro do login.", 500);

  const params = redirectUrl(role);
  params.set("state", state);
  params.set("code_challenge", codeChallenge);
  return Response.redirect(`${KICK_AUTHORIZE_URL}?${params.toString()}`, 302);
}

async function exchangeCode(code: string, codeVerifier: string) {
  const response = await fetch(KICK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: KICK_CLIENT_ID,
      client_secret: KICK_CLIENT_SECRET,
      redirect_uri: KICK_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token || !data.refresh_token) {
    console.error("Kick token exchange failed", response.status, data);
    throw new Error("A Kick recusou a troca do código OAuth.");
  }
  return data as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  };
}

async function getKickUser(accessToken: string) {
  const response = await fetch(`${KICK_API_URL}/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error("Não foi possível identificar a conta autorizada na Kick.");
  return (data.data?.[0] ?? null) as { user_id?: number; username?: string } | null;
}

async function subscribeChannelEvents(accessToken: string) {
  if (!KICK_WEBHOOK_URL) return;
  const response = await fetch(`${KICK_API_URL}/events/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      method: "webhook",
      events: [{ name: "chat.message.sent", version: 1 }],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("Kick event subscription failed", response.status, data);
    throw new Error("A conta do canal foi autorizada, mas a assinatura do chat falhou.");
  }
}

async function finishOAuth(code: string, state: string) {
  const { data: oauthState, error: stateError } = await supabase
    .from("kick_oauth_states")
    .select("role, code_verifier, created_at")
    .eq("state", state)
    .maybeSingle();

  if (stateError || !oauthState) return html("OAuth inválido", "O estado de autorização não foi encontrado ou já foi usado.", 400);
  if (Date.now() - new Date(oauthState.created_at).getTime() > 10 * 60_000) {
    await supabase.from("kick_oauth_states").delete().eq("state", state);
    return html("OAuth expirado", "Inicie a autorização novamente.", 400);
  }

  const token = await exchangeCode(code, oauthState.code_verifier);
  const user = await getKickUser(token.access_token);

  const { error: tokenError } = await supabase.from("kick_bot_tokens").upsert({
    role: oauthState.role,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: new Date(Date.now() + Number(token.expires_in ?? 3600) * 1000).toISOString(),
    scope: token.scope ?? null,
    kick_user_id: user?.user_id ?? null,
    kick_username: user?.username ?? null,
    updated_at: new Date().toISOString(),
  });
  await supabase.from("kick_oauth_states").delete().eq("state", state);

  if (tokenError) {
    console.error("Failed to persist Kick token", tokenError);
    return html("Erro ao salvar autorização", "A Kick autorizou a conta, mas o MusicasChatt não conseguiu guardar o token com segurança.", 500);
  }

  if (oauthState.role === "channel") await subscribeChannelEvents(token.access_token);

  const label = oauthState.role === "bot" ? "conta do bot" : "conta do canal";
  return html("Kick conectado!", `A ${label} <strong>${user?.username ?? "conta autorizada"}</strong> foi vinculada ao MusicasChatt. Você pode fechar esta aba.`);
}

Deno.serve(async (request) => {
  try {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    if (url.searchParams.has("code") && url.searchParams.has("state")) {
      return await finishOAuth(url.searchParams.get("code")!, url.searchParams.get("state")!);
    }

    const role = url.searchParams.get("role");
    if (role === "channel" || role === "bot") return await startOAuth(role);

    return html("MusicasChatt — Kick Bot", "Use ?role=channel para autorizar o canal ou ?role=bot para autorizar a conta do bot.");
  } catch (error) {
    console.error("kick-oauth error", error);
    return html("Erro no Kick OAuth", error instanceof Error ? error.message : "Erro inesperado.", 500);
  }
});
