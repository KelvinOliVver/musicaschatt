/** Shared playback state sent by the elected host over Supabase Realtime.
 * Events belong to a specific queued item and have an increasing sequence.
 * Viewers must not apply an old event to a new video.
 */
export interface PlaybackSyncState {
  trackId: string;
  senderId: string;
  sequence: number;
  sentAt: number;
  time: number;
  paused: boolean;
  volume: number;
  muted: boolean;
}

export function parsePlaybackSync(value: unknown): PlaybackSyncState | null {
  if (!value || typeof value !== "object") return null;
  const packet = value as Partial<PlaybackSyncState>;
  if (typeof packet.trackId !== "string" || packet.trackId.length > 128 ||
      typeof packet.senderId !== "string" || packet.senderId.length > 128 ||
      typeof packet.sequence !== "number" || !Number.isSafeInteger(packet.sequence) || packet.sequence < 0 ||
      typeof packet.sentAt !== "number" || !Number.isFinite(packet.sentAt) ||
      typeof packet.time !== "number" || !Number.isFinite(packet.time) || packet.time < 0 ||
      typeof packet.paused !== "boolean" || typeof packet.muted !== "boolean" ||
      typeof packet.volume !== "number" || !Number.isFinite(packet.volume)) return null;
  if (packet.volume < 0 || packet.volume > 100) return null;
  return packet as PlaybackSyncState;
}

export function projectedPlaybackTime(state: PlaybackSyncState, now = Date.now()): number {
  // A paused stream never progresses while a packet is in transit.
  // Cap latency compensation to avoid fast-forwarding on stale packets.
  const delay = Math.max(0, Math.min(5, (now - state.sentAt) / 1000));
  return state.time + (state.paused ? 0 : delay);
}

export function shouldAcceptPlaybackSync(
  incoming: PlaybackSyncState,
  expectedTrackId: string | null,
  hostClientId: string | null,
  last: PlaybackSyncState | null,
  now = Date.now(),
): boolean {
  if (!expectedTrackId || !hostClientId ||
      incoming.trackId !== expectedTrackId || incoming.senderId !== hostClientId) return false;
  if (Math.abs(now - incoming.sentAt) > 20_000) return false;
  if (last && last.trackId === incoming.trackId && last.senderId === incoming.senderId &&
      incoming.sequence <= last.sequence) return false;
  return true;
}
