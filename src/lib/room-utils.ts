export const DEFAULT_ROOM = "roceiraplay";
export function normalizeRoomSlug(raw: string): string | null {
  const slug = raw.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(slug) ? slug : null;
}
export function roomFromSearch(search: string): string {
  const channel = new URLSearchParams(search).get("channel");
  return normalizeRoomSlug(channel || "") ?? DEFAULT_ROOM;
}
export interface WaitItem { durationSeconds?: number | null; priority: boolean; position: number; }
export function estimateWaitingSeconds(items: WaitItem[], index: number, defaultSeconds = 180): number {
  if (index < 0 || index >= items.length) return 0;
  return items.slice(0,index).reduce((sum, item) => sum + (
    typeof item.durationSeconds === "number" && item.durationSeconds > 0
      ? item.durationSeconds : defaultSeconds
  ),0);
}
export function displayWait(seconds: number): string {
  if (!seconds) return "Próximo";
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `~${minutes} min` : `~${Math.floor(minutes/60)}h${minutes%60 ? ` ${minutes%60}min` : ""}`;
}

/** Keep pending and rejected requests out of the active playback queue. */
export function classifyRoomQueueRow(
  row: { room_slug: string; status: string; approval_status: string },
  selectedRoom: string,
): "playing" | "queued" | "pending" | "history" | "ignore" {
  if (row.room_slug !== selectedRoom || row.approval_status === "rejected") return "ignore";
  if (row.status === "playing") return "playing";
  if (row.status === "queued")
    return row.approval_status === "pending" ? "pending" : "queued";
  if (row.status === "played") return "history";
  return "ignore";
}
