import { useCallback, useEffect, useRef, useState } from "react";
import { getKickChannelInfo } from "./kick.functions";
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
  
  // Inicializa o estado buscando do localStorage para não perder o histórico ao recarregar
  const [messages, setMessages] = useState<KickChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const normalized = slug.trim().toLowerCase();
      const cached = localStorage.getItem(`kick_chat_cache_${normalized}`);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

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

    // Tenta carregar o cache do localStorage específico do canal atual
    try {
      const cached = localStorage.getItem(`kick_chat_cache_${normalized}`);
      if (cached) {
        setMessages(JSON.parse(cached));
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retries = 0;

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

        // --- DIAGNÓSTICO NO CONSOLE (F12) ---
        console.log(`[KickChat Debug] User recebido: "${username}" | Mensagem: "${content}"`);

        // =========================================================================
        // FILTRO ROBUSTO DE COMANDO (Ignora maiúsculas/minúsculas e espaços extras)
        // =========================================================================
        const cleanUsername = username.trim().toLowerCase();
        
        if (cleanUsername === "pitee4") {
          const lowerContent = content.toLowerCase();
          if (
            lowerContent === "!skip" || 
            lowerContent === "!proxima" || 
            lowerContent === "!back" || 
            lowerContent === "!anterior"
          ) {
            console.log(`[KickChat] Comando aceito de ${username}: ${lowerContent}`);
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
          const limited = next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
          
          // Salva no localStorage para persistir entre reloads
          try {
            localStorage.setItem(`kick_chat_cache_${normalized}`, JSON.stringify(limited));
          } catch {}

          return limited;
        });

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
