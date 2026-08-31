export type TrackSource = "youtube" | "spotify";

export interface QueueItem {
  /** Stable local id for React keys and queue operations. */
  id: string;
  source: TrackSource;
  /** YouTube video id or Spotify track id. */
  trackId: string;
  url: string;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  /** Kick chat username that requested the track. */
  requestedBy: string;
  /** Display color of the requester in Kick chat. */
  requesterColor: string | null;
  /** True when the requester is on the priority (VIP) list. */
  priority: boolean;
  addedAt: number;
}

export interface KickChatMessage {
  id: string;
  username: string;
  color: string | null;
  content: string;
  createdAt: string;
}

export type ChatStatus =
  | "idle"
  | "resolving"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface KickChannelInfo {
  slug: string;
  chatroomId: number;
  channelId: number;
  displayName: string;
  avatar: string | null;
  isLive: boolean;
}
