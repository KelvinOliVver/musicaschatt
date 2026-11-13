import { useCallback, useEffect, useRef, useState } from "react";
import { getKickChannelInfo, getKickUserAvatar } from "./kick.functions";
import { fetchKickChatAvatars, normalizeKickAvatar, normalizeKickUsername } from "./kick-avatars";
import { supabase } from "@/integrations/supabase/client";
import type { ChatStatus, KickChannelInfo, KickChatMessage } from "./types";

/** Legacy public Pusher endpoint. Kept as a fallback for channels/environments where it still works. */
const KICK_PUSHER_KEY = "34bf7a0ff419a2a775b9";
const KICK_PUSHER_URL = `wss://ws-us2.pusher.com/app/${KICK_PUSHER_KEY}?protocol=7&client=js&version=8.4.0&flash=false`;
const KICK_VIEWER_TOKEN_URL = "https://websockets.kick.com/viewer/v1/token";
const KICK_VIEWER_SOCKET_URL = "wss://websockets.kick.com/viewer/v1/connect?token=";
const KICK_CLIENT_TOKEN = "e1393935a959b4020a4491574f6490129f678acdaa92760471263db43487f823";
const CHAT_EVENT = "App\\Events\\ChatMessageEvent";
const MAX_MESSAGES = 150;
const AVATAR_REFRESH_MS = 5 * 60 * 1000;

// Retain IDs across reconnections on the same tab. WebSocket retries can
// replay messages and must never trigger the same queue/command twice.
const recentlyProcessedByChannel = new Map<string, Set<string>>();
function processedIdsForChannel(channel: string): Set<string> {
  let ids = recentlyProcessedByChannel.get(channel);
  if (!ids) {
    ids = new Set<string>();
    recentlyProcessedByChannel.set(channel, ids);
    if (recentlyProcessedByChannel.size > 4) {
      const oldest = recentlyProcessedByChannel.keys().next().value;
      if (oldest) recentlyProcessedByChannel.delete(oldest);
    }
  }
  return ids;
}

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
    profile_picture?: string | null;
    profile_pic?: string | null;
    avatar?: string | null;
    identity?: { color?: string; badges?: Array<string | { type?: string; name?: string }> };
  };
  user?: {
    username?: string;
    profile_picture?: string | null;
    profile_pic?: string | null;
    identity?: { color?: string };
  };
  profile_picture?: string | null;
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
  avatarUrl: string | null;
  badges: string[];
} | null {
  const content = (payload.content ?? payload.message ?? "").trim();
  const username = (payload.sender?.username ?? payload.user?.username ?? "").trim();
  if (!content) return null;

  return {
    content,
    username,
    color: payload.sender?.identity?.color ?? payload.user?.identity?.color ?? null,
    badges: (payload.sender?.identity?.badges ?? payload.user?.identity?.badges ?? [])
      .map((badge) => typeof badge === "string" ? badge : badge?.type ?? badge?.name ?? "")
      .map((value) => value.toLowerCase())
      .filter((value) => /mod|vip|broadcaster|streamer|sub|og|verified/.test(value)).slice(0, 5),
    avatarUrl: normalizeKickAvatar(
      payload.sender?.profile_picture ??
      payload.sender?.profile_pic ??
      payload.sender?.avatar ??
      payload.user?.profile_picture ??
      payload.user?.profile_pic ??
      payload.profile_picture,
    ),
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
  shouldPersist?: () => boolean,
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
  const shouldPersistRef = useRef(shouldPersist);
  shouldPersistRef.current = shouldPersist;

  const reconnect = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) {
      setStatus("idle");
      setMessages([]);
      setChannel(null);
      setError(null);
      return;
    }

    let disposed = false;
    // Avoid replaying the same song request or chat command after reconnects.
    const seenMessageIds = processedIdsForChannel(normalized);
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let retries = 0;
    let avatarTimer: ReturnType<typeof setInterval> | undefined;
    let avatarRequest: AbortController | null = null;
    const avatarByUser = new Map<string, string>();
    // Fallback lookup for chatters absent from Kick's active-chatters endpoint.
    // Limit concurrency and do not query the same username repeatedly.
    const avatarLookupAttempted = new Set<string>();
    const avatarLookupQueue: string[] = [];
    let avatarLookupsRunning = 0;
    const lookupAvatarForUser = (rawUsername: string) => {
      const username = normalizeKickUsername(rawUsername);
      if (!username || avatarByUser.has(username) || avatarLookupAttempted.has(username)) return;
      if (avatarLookupAttempted.size >= 100) return;
      avatarLookupAttempted.add(username);
      avatarLookupQueue.push(username);
      pumpAvatarLookups();
    };
    const pumpAvatarLookups = () => {
      while (!disposed && avatarLookupsRunning < 2 && avatarLookupQueue.length > 0) {
        const username = avatarLookupQueue.shift()!;
        if (avatarByUser.has(username)) continue;
        avatarLookupsRunning++;
        void getKickUserAvatar({ data: { username } })
          .then((candidate) => {
            if (disposed || !candidate) return;
            const avatar = normalizeKickAvatar(candidate);
            if (!avatar) return;
            avatarByUser.set(username, avatar);
            setMessages((current) => {
              let changed = false;
              const updated = current.map((message) => {
                if (normalizeKickUsername(message.username) !== username || message.avatarUrl === avatar) return message;
                changed = true;
                return { ...message, avatarUrl: avatar };
              });
              return changed ? updated : current;
            });
          })
          .catch(() => { /* Keep the initial when Kick blocks profile requests. */ })
          .finally(() => { avatarLookupsRunning--; pumpAvatarLookups(); });
      }
    };

    // Kick's active chatters endpoint can expose photos for many people in
    // one request. It is optional and can be blocked; initials remain a fallback.
    const updateChatAvatars = async (channelId: number) => {
      if (disposed || avatarRequest) return;
      const controller = new AbortController();
      avatarRequest = controller;
      try {
        const avatars = await fetchKickChatAvatars(channelId, controller.signal);
        if (disposed || controller.signal.aborted || avatars.size === 0) return;
        for (const [username, url] of avatars) avatarByUser.set(username, url);
        setMessages((current) => {
          let changed = false;
          const updated = current.map((message) => {
            const avatar = avatarByUser.get(normalizeKickUsername(message.username) ?? "");
            if (!avatar || message.avatarUrl === avatar) return message;
            changed = true;
            return { ...message, avatarUrl: avatar };
          });
          return changed ? updated : current;
        });
      } catch {
        // CORS/Cloudflare restrictions are expected in some environments.
      } finally {
        if (avatarRequest === controller) avatarRequest = null;
      }
    };

    setMessages([]);
    setChannel(null);
    setError(null);
    setStatus("resolving");

    void loadChatHistory(normalized).then((history) => {
      if (disposed) return;
      for (const message of history) seenMessageIds.add(message.id);
      setMessages((current) => mergeMessages(current, history.map((message) => ({
        ...message,
        avatarUrl: avatarByUser.get(normalizeKickUsername(message.username) ?? "") ?? null,
      }))));
      // Only resolve recent distinct history users, never every old message.
      for (const name of [...new Set(history.slice(-25).map((message) => message.username))]) {
        lookupAvatarForUser(name);
      }
    });

    const handleChatPayload = (payload: KickChatPayload) => {
      const normalizedPayload = normalizeChatPayload(payload);
      if (!normalizedPayload) return;

      const messageId = payload.id == null ? null : String(payload.id);
      if (messageId && seenMessageIds.has(messageId)) return;
      if (messageId) {
        seenMessageIds.add(messageId);
        if (seenMessageIds.size > 1000) {
          const oldestId = seenMessageIds.values().next().value;
          if (oldestId) seenMessageIds.delete(oldestId);
        }
      }

      const { content, username, color, avatarUrl, badges } = normalizedPayload;
      const normalizedUsername = normalizeKickUsername(username);
      if (normalizedUsername && avatarUrl) avatarByUser.set(normalizedUsername, avatarUrl);
      if (normalizedUsername && !avatarUrl && !avatarByUser.has(normalizedUsername)) {
        lookupAvatarForUser(normalizedUsername);
      }
      const resolvedAvatar = avatarUrl ?? avatarByUser.get(normalizedUsername ?? "") ?? null;
      const commandText = content.trim().toLowerCase();

      { // Parse supported commands for every sender; authorization happens in the player.
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
            id: messageId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            username: username || "Pitee4",
            color,
            avatarUrl: resolvedAvatar,
            badges,
            content: canonicalCommand,
            createdAt: payload.created_at ?? new Date().toISOString(),
            kind: "command",
          };

          setMessages((current) => mergeMessages(current, [commandMessage]));
          if (shouldPersistRef.current?.() ?? true) persistMessage(commandMessage, normalized);
          // Never invent a privileged identity for messages without a Kick sender.
          if (username) onCommandRef.current?.(canonicalCommand, username);
          return;
        }
      }

      const message: KickChatMessage = {
        id: messageId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        username: username || "desconhecido",
        color,
        avatarUrl: resolvedAvatar,
        badges,
        content,
        createdAt: payload.created_at ?? new Date().toISOString(),
        kind: "message",
      };

      setMessages((current) => mergeMessages(current, [message]));
      if (shouldPersistRef.current?.() ?? true) persistMessage(message, normalized);
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
            retryTimer = setTimeout(() => openSocket(info, false), Math.min(1000 * 2 ** Math.min(retries, 5), 20000));
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
        retryTimer = setTimeout(() => openSocket(info, false), Math.min(1000 * 2 ** Math.min(retries, 5), 20000));
      };
    };

    getKickChannelInfo({ data: { slug: normalized } })
      .then((info) => {
        if (disposed) return;
        setChannel(info);
        if (info.channelId > 0) {
          void updateChatAvatars(info.channelId);
          avatarTimer = setInterval(() => {
            if (document.visibilityState === "visible") void updateChatAvatars(info.channelId);
          }, AVATAR_REFRESH_MS);
        }
        openSocket(info, false);
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : "Falha ao conectar no chat.");
        setStatus("error");
      });

    return () => {
      disposed = true;
      avatarLookupQueue.length = 0;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (avatarTimer) clearInterval(avatarTimer);
      avatarRequest?.abort();
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
