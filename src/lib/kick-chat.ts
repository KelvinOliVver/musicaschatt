import { useCallback, useEffect, useRef, useState } from "react";
import { getKickChannelInfo } from "./kick.functions";
import { supabase } from "@/integrations/supabase/client";
import type { ChatStatus, KickChannelInfo, KickChatMessage } from "./types";

/** Legacy public Pusher endpoint. Kept as a fallback for channels/environments where it still works. */
const KICK_PUSHER_KEY = "32cbd69e4b950bf97679";
const KICK_PUSHER_URL = `wss://ws-us2.pusher.com/app/${KICK_PUSHER_KEY}?protocol=7&client=js&version=8.4.0&flash=false`;
const KICK_VIEWER_TOKEN_URL = "https://websockets.kick.com/viewer/v1/token";
const KICK_VIEWER_SOCKET_URL = "wss://websockets.kick.com/viewer/v1/connect?token=";
const KICK_CLIENT_TOKEN = "e1393935a959b4020a4491574f6490129f678acdaa92760471263db43487f823";
const CHAT_EVENT = "App\\Events\\ChatMessageEvent";
const MAX_MESSAGES = 120;

interface PusherEnvelope {
  event?: string;
  data?: string | Record<string, unknown>;
  channel?: string;
  type?: string;
}

interface KickChatPayload {
  id?: string;
  content?: string;
  message?: string;
  created_at?: string;
  sender?: {
    username?: string;
    identity?: { color?: string };
  };
  user?: {
    username?: string;
    identity?: { color?: string };
  };
}

export interface UseKickChatResult {
  status: ChatStatus;
  error: string | null;
  channel: KickChannelInfo | null;
  messages: KickChatMessage[];
  reconnect: () => void;
}

function mergeMessages(current: KickChatMessage[], incoming: KickChatMessage[]): KickChatMessage[] {
  const byId = new Map<string, KickChatMessage>();
  for (const message of [...current, ...incoming]) byId.set(message.id, message);

  return Array.from(byId.values())
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-MAX_MESSAGES);
}

// Keep this isolated from generated Supabase types so the app can still build
// while Lovable refreshes its generated schema types after applying migrations.
const chatDb = supabase as any;

function persistMessage(message: KickChatMessage, channelSlug: string) {
  void chatDb
    .from("chat_messages")
    .upsert(
      {
        id: message.id,
        channel_slug: channelSlug,
        username: message.username,
        color: message.color,
        content: message.content,
        created_at: message.createdAt,
        kind: message.kind ?? "message",
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error("[CHAT HISTORY SAVE]", error.message);
    });
}

async function loadChatHistory(channelSlug: string): Promise<KickChatMessage[]> {
  const { data, error } = await chatDb
    .from("chat_messages")
    .select("id, channel_slug, username, color, content, created_at, kind")
    .eq("channel_slug", channelSlug)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);

  if (error || !data) {
    if (error) console.error("[CHAT HISTORY LOAD]", error.message);
    return [];
  }

  return data.reverse().map((row: {
    id: string;
    username: string;
    color: string | null;
    content: string;
    created_at: string;
    kind: string;
  }) => ({
    id: row.id,
    username: row.username,
    color: row.color,
    content: row.content,
    createdAt: row.created_at,
    kind: row.kind === "command" ? "command" : "message",
  } as KickChatMessage));
}

async function fetchKickViewerToken(): Promise<string | null> {
  try {
    // Kick's current viewer gateway uses a short-lived, single-use token.
    // This is best-effort: if the browser cannot access the token endpoint,
    // the legacy Pusher connection below remains available as a fallback.
    await fetch("https://kick.com/", {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml" },
      credentials: "include",
      cache: "no-store",
    }).catch(() => undefined);

    const response = await fetch(KICK_VIEWER_TOKEN_URL, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-CLIENT-TOKEN": KICK_CLIENT_TOKEN,
        Referer: "https://kick.com/",
      },
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: { token?: string } };
    return payload.data?.token ?? null;
  } catch {
    return null;
  }
}

function parseEnvelopeData(data: PusherEnvelope["data"]): KickChatPayload | null {
  if (!data) return null;

  try {
    if (typeof data === "string") return JSON.parse(data) as KickChatPayload;
    return data as KickChatPayload;
  } catch {
    return null;
  }
}

function normalizeChatPayload(payload: KickChatPayload): {
  content: string;
  username: string;
  color: string | null;
} | null {
  const content = (payload.content ?? payload.message ?? "").trim();
  const username = (payload.sender?.username ?? payload.user?.username ?? "").trim();
  if (!content) return null;

  return {
    content,
    username,
    color: payload.sender?.identity?.color ?? payload.user?.identity?.color ?? null,
  };
}

/**
 * Connects to a Kick channel's public chat and streams incoming messages.
 * Kick changed its realtime transport in 2026, so the current viewer gateway
 * is attempted first and the old Pusher endpoint is retained as a fallback.
 */
export function useKickChat(
  slug: string,
  onMessage?: (message: KickChatMessage) => void,
  onCommand?: (command: string, username: string) => void,
): UseKickChatResult {
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<KickChannelInfo | null>(null);
  const [messages, setMessages] = useState<KickChatMessage[]>([]);
  const [attempt, setAttempt] = useState(0);

  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  const reconnect = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) {
      setStatus("idle");
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let retries = 0;

    setMessages([]);
    setChannel(null);
    setError(null);
    setStatus("resolving");

    void loadChatHistory(normalized).then((history) => {
      if (disposed) return;
      setMessages((current) => mergeMessages(current, history));
    });

    const handleChatPayload = (payload: KickChatPayload) => {
      const normalizedPayload = normalizeChatPayload(payload);
      if (!normalizedPayload) return;

      const { content, username, color } = normalizedPayload;
      const cleanUsername = username.toLowerCase();
      const commandText = content.trim().toLowerCase();

      if (cleanUsername === "pitee4") {
        const commandAliases: Record<string, string> = {
          "!next": "!proxima",
          "!pular": "!proxima",
          "!prev": "!anterior",
          "!previous": "!anterior",
          "!voltar": "!anterior",
          "!pause": "!pausar",
          "!parar": "!pausar",
          "!resume": "!continuar",
          "!play": "!continuar",
          "!retomar": "!continuar",
          "!clear": "!limpar",
          "!limparfila": "!limpar",
        };

        const canonicalCommand = commandAliases[commandText] ?? commandText;
        const supportedCommands = new Set([
          "!skip",
          "!proxima",
          "!back",
          "!anterior",
          "!pausar",
          "!continuar",
          "!limpar",
        ]);

        if (supportedCommands.has(canonicalCommand)) {
          const commandMessage: KickChatMessage = {
            id: payload.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            username: username || "Pitee4",
            color,
            content: canonicalCommand,
            createdAt: payload.created_at ?? new Date().toISOString(),
            kind: "command",
          };

          setMessages((current) => mergeMessages(current, [commandMessage]));
          persistMessage(commandMessage, normalized);
          onCommandRef.current?.(canonicalCommand, username || "Pitee4");
          return;
        }
      }

      const message: KickChatMessage = {
        id: payload.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        username: username || "desconhecido",
        color,
        content,
        createdAt: payload.created_at ?? new Date().toISOString(),
        kind: "message",
      };

      setMessages((current) => mergeMessages(current, [message]));
      persistMessage(message, normalized);
      onMessageRef.current?.(message);
    };

    const openSocket = (info: KickChannelInfo, useCurrentGateway: boolean) => {
      if (disposed) return;
      setStatus(retries === 0 ? "connecting" : "reconnecting");

      if (useCurrentGateway) {
        void fetchKickViewerToken().then((token) => {
          if (disposed) return;
          if (!token) {
            openSocket(info, false);
            return;
          }

          const ws = new WebSocket(`${KICK_VIEWER_SOCKET_URL}${encodeURIComponent(token)}`);
          socket = ws;

          ws.onopen = () => {
            ws.send(JSON.stringify({
              event: "pusher:subscribe",
              data: { auth: "", channel: `chatrooms.${info.chatroomId}.v2` },
            }));
            ws.send(JSON.stringify({
              type: "channel_handshake",
              data: { message: { channelId: info.channelId } },
            }));

            pingTimer = setInterval(() => {
              if (ws.readyState !== WebSocket.OPEN) return;
              ws.send(JSON.stringify({ event: "pusher:ping", data: {} }));
            }, 20000);
          };

          ws.onmessage = (event) => {
            let envelope: PusherEnvelope;
            try {
              envelope = JSON.parse(String(event.data)) as PusherEnvelope;
            } catch {
              return;
            }

            if (envelope.event === "pusher:connection_established") return;
            if (envelope.event === "pusher_internal:subscription_succeeded") {
              retries = 0;
              setStatus("connected");
              return;
            }
            if (envelope.event !== CHAT_EVENT) return;

            const payload = parseEnvelopeData(envelope.data);
            if (payload) handleChatPayload(payload);
          };

          ws.onerror = () => {
            if (!disposed) setStatus("reconnecting");
          };

          ws.onclose = () => {
            if (disposed) return;
            if (pingTimer) clearInterval(pingTimer);
            pingTimer = undefined;
            setStatus("reconnecting");
            retries += 1;
            retryTimer = setTimeout(() => openSocket(info, true), Math.min(1000 * 2 ** Math.min(retries, 5), 20000));
          };
        });
        return;
      }

      const ws = new WebSocket(KICK_PUSHER_URL);
      socket = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          event: "pusher:subscribe",
          data: { auth: "", channel: `chatrooms.${info.chatroomId}.v2` },
        }));
      };

      ws.onmessage = (event) => {
        let envelope: PusherEnvelope;
        try {
          envelope = JSON.parse(String(event.data)) as PusherEnvelope;
        } catch {
          return;
        }

        if (envelope.event === "pusher:connection_established") return;
        if (envelope.event === "pusher_internal:subscription_succeeded") {
          retries = 0;
          setStatus("connected");
          return;
        }
        if (envelope.event !== CHAT_EVENT) return;

        const payload = parseEnvelopeData(envelope.data);
        if (payload) handleChatPayload(payload);
      };

      ws.onerror = () => {
        if (!disposed) setStatus("reconnecting");
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus("reconnecting");
        retries += 1;
        retryTimer = setTimeout(() => openSocket(info, true), Math.min(1000 * 2 ** Math.min(retries, 5), 20000));
      };
    };

    getKickChannelInfo({ data: { slug: normalized } })
      .then((info) => {
        if (disposed) return;
        setChannel(info);
        openSocket(info, true);
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : "Falha ao conectar no chat.");
        setStatus("error");
      });

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
      }
    };
  }, [slug, attempt]);

  return { status, error, channel, messages, reconnect };
}
