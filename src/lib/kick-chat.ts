import { useCallback, useEffect, useRef, useState } from "react";
import { getKickChannelInfo } from "./kick.functions";
import type { ChatStatus, KickChannelInfo, KickChatMessage } from "./types";
import { supabase } from "@/integrations/supabase/client";

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

/**
 * Connects to a Kick channel's public chat over the Pusher WebSocket protocol
 * and streams incoming messages. Reconnects automatically with backoff.
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

      ws.onmessage = async (event) => {
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

        // =========================================================================
        // FILTRO ROBUSTO DE COMANDO (Ignora maiúsculas/minúsculas e espaços extras)
        // Só o usuário "Pitee4" (streamer) consegue disparar comandos de controle.
        // =========================================================================
        const cleanUsername = username.trim().toLowerCase();

        if (cleanUsername === "pitee4") {
          const lowerContent = content.toLowerCase();
          if (
            lowerContent === "!skip" ||
            lowerContent === "!proxima" ||
            lowerContent === "!back" ||
            lowerContent === "!anterior" ||
            lowerContent === "!pausar" ||
            lowerContent === "!continuar" ||
            lowerContent === "!limpar"
          ) {
            onCommandRef.current?.(lowerContent, username);
            return;
          }
        }
        // =========================================================================

        const message: KickChatMessage = {
          id: payload.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          username: username || "desconhecido",
          color: payload.sender?.identity?.color ?? null,
          content,
          createdAt: payload.created_at ?? new Date().toISOString(),
        };

        setMessages((current) => {
          const next = [...current, message];
          return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
        });

        // O cooldown é decidido no banco, de forma atômica. Assim ele não
        // pode ser burlado por reload, reconexão, troca de host ou múltiplas
        // abas/dispositivos recebendo a mesma mensagem simultaneamente.
        if (extractsTrack(message.content)) {
          const { data: allowed, error: cooldownError } = await supabase.rpc(
            "claim_chat_request_cooldown",
            { p_username: message.username },
          );

          if (cooldownError) {
            console.error("[CHAT COOLDOWN ERROR]", cooldownError.message);
            // Fail closed: se não conseguimos consultar o cooldown, não
            // adicionamos a música por acidente.
            return;
          }

          if (!allowed) return;
        }

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

function extractsTrack(content: string): boolean {
  return /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/)/i.test(content);
}
