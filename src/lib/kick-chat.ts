import { useCallback, useEffect, useRef, useState } from "react";
import { getKickChannelInfo } from "./kick.functions";
import { supabase } from "@/integrations/supabase/client";
import type { ChatStatus, KickChannelInfo, KickChatMessage } from "./types";

/** Public Pusher app key used by kick.com's own web chat. */
const KICK_PUSHER_KEY = "32cbd69e4b950bf97679";
const KICK_PUSHER_URL = `wss://ws-us2.pusher.com/app/${KICK_PUSHER_KEY}?protocol=7&client=js&version=8.4.0&flash=false`;
const CHAT_EVENT = "App\\Events\\ChatMessageEvent";
const MAX_MESSAGES = 120;

interface PusherEnvelope {
  event?: string;
  data?: string;
  channel?: string;
}

interface KickChatPayload {
  id?: string;
  content?: string;
  created_at?: string;
  sender?: {
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

/**
 * Connects to a Kick channel's public chat over the Pusher WebSocket protocol
 * and streams incoming messages. Reconnects automatically with backoff.
 * Recent chat history is persisted in Supabase and restored after refresh.
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
    let retries = 0;

    setMessages([]);
    setChannel(null);
    setError(null);
    setStatus("resolving");

    void loadChatHistory(normalized).then((history) => {
      if (disposed) return;
      setMessages((current) => mergeMessages(current, history));
    });

    const openSocket = (info: KickChannelInfo) => {
      if (disposed) return;
      setStatus(retries === 0 ? "connecting" : "reconnecting");

      const ws = new WebSocket(KICK_PUSHER_URL);
      socket = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            event: "pusher:subscribe",
            data: { auth: "", channel: `chatrooms.${info.chatroomId}.v2` },
          }),
        );
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
        if (envelope.event !== CHAT_EVENT || !envelope.data) return;

        let payload: KickChatPayload;
        try {
          payload = JSON.parse(envelope.data) as KickChatPayload;
        } catch {
          return;
        }

        const content = payload.content?.trim() ?? "";
        const username = payload.sender?.username ?? "";
        if (!content) return;

        const cleanUsername = username.trim().toLowerCase();

        if (cleanUsername === "pitee4") {
          const lowerContent = content.toLowerCase();
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

          const canonicalCommand = commandAliases[lowerContent] ?? lowerContent;
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
              color: payload.sender?.identity?.color ?? null,
              content: canonicalCommand,
              createdAt: payload.created_at ?? new Date().toISOString(),
              kind: "command",
            };

            setMessages((current) => mergeMessages(current, [commandMessage]));
            persistMessage(commandMessage, normalized);
            onCommandRef.current?.(canonicalCommand, username);
            return;
          }
        }

        const message: KickChatMessage = {
          id: payload.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          username: username || "desconhecido",
          color: payload.sender?.identity?.color ?? null,
          content,
          createdAt: payload.created_at ?? new Date().toISOString(),
          kind: "message",
        };

        setMessages((current) => mergeMessages(current, [message]));
        persistMessage(message, normalized);
        onMessageRef.current?.(message);
      };

      ws.onerror = () => {
        if (!disposed) setStatus("reconnecting");
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus("reconnecting");
        retries += 1;
        const delay = Math.min(1000 * 2 ** Math.min(retries, 5), 20000);
        retryTimer = setTimeout(() => openSocket(info), delay);
      };
    };

    getKickChannelInfo({ data: { slug: normalized } })
      .then((info) => {
        if (disposed) return;
        setChannel(info);
        openSocket(info);
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : "Falha ao conectar no chat.");
        setStatus("error");
      });

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
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
