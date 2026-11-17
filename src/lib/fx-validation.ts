export const FX_MEDIA_BUCKET = "fx-media";
export type FxKind = "audio" | "image" | "gif" | "video";
export type FxPosition = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";
export type FxSize = "small" | "medium" | "large";
export interface FxEffect {
  id: string; title: string; media_type: FxKind;
  media_path: string | null; external_url: string | null;
  volume: number; display_seconds: number; position: FxPosition; size: FxSize;
  created_at?: string;
}
export interface FxSettings { overlay_token: string; master_volume: number; cooldown_ms: number; }
export interface FxEvent {
  id: number; command: "PLAY" | "STOP_ALL" | "TEST"; createdAt?: string; payload?: {
    title?: string; mediaType?: FxKind; mediaPath?: string | null; externalUrl?: string | null;
    volume?: number; masterVolume?: number; seconds?: number;
    position?: FxPosition; size?: FxSize;
  } | null;
}
const audio = ["audio/mpeg","audio/ogg","audio/wav","audio/x-wav"];
const images = ["image/png","image/jpeg","image/webp","image/gif"];
const video = ["video/mp4","video/webm"];
export function identifyFxFile(file: Pick<File,"name"|"size"|"type">): { kind: FxKind; error?: never } | { kind?: never; error: string } {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const type = file.type.toLowerCase();
  const kind: FxKind | null =
    ext === "mp3" && type === "audio/mpeg" ? "audio" :
    ext === "wav" && audio.includes(type) ? "audio" :
    ext === "ogg" && type === "audio/ogg" ? "audio" :
    ext === "png" && type === "image/png" ? "image" :
    (ext === "jpg" || ext === "jpeg") && type === "image/jpeg" ? "image" :
    ext === "webp" && type === "image/webp" ? "image" :
    ext === "gif" && type === "image/gif" ? "gif" :
    (ext === "mp4" || ext === "webm") && video.includes(type) ? "video" : null;
  if (!kind) return {error:"Formato não aceito. Use MP3, WAV, OGG, PNG, JPG, WebP, GIF, MP4 ou WebM."};
  const max = kind === "video" ? 50 * 1024 * 1024 : kind === "audio" ? 15 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size === 0 || file.size > max) return { error: "Arquivo vazio ou maior que o limite permitido." };
  return {kind};
}
/** YouTube links are webpages, not direct video files. Accept only official video hosts. */
export function parseFxYouTubeId(value: string): string | null {
  try {
    const url=new URL(value.trim());
    if(url.protocol!=="https:" || url.username || url.password) return null;
    const host=url.hostname.toLowerCase();
    const isYoutube=["youtube.com","www.youtube.com","m.youtube.com","music.youtube.com"].includes(host);
    const isShort=["youtu.be","www.youtu.be"].includes(host);
    const isNoCookie=["youtube-nocookie.com","www.youtube-nocookie.com"].includes(host);
    if(!isYoutube&&!isShort&&!isNoCookie)return null;
    const path=url.pathname.split("/").filter(Boolean);
    const id=isShort ? path.length===1 ? path[0] : null :
      path[0]==="watch" ? url.searchParams.get("v") :
      (["shorts","live","embed"].includes(path[0]??"") && path.length===2) ? path[1] : null;
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }catch{return null;}
}
export function looksLikeFxYouTubeUrl(value: string): boolean {
  try {
    const url=new URL(value.trim());
    return ["youtube.com","www.youtube.com","m.youtube.com","music.youtube.com",
      "youtu.be","www.youtu.be","youtube-nocookie.com","www.youtube-nocookie.com"]
      .includes(url.hostname.toLowerCase());
  }catch{return false;}
}
export function validFxUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password && url.href.length <= 1800
      && (!looksLikeFxYouTubeUrl(url.href) || parseFxYouTubeId(url.href)!==null);
  } catch { return false; }
}
export function normalizeFxVolume(value: number): number { return Number.isFinite(value) ? Math.min(100,Math.max(0,Math.round(value))) : 80; }
export function fxSeconds(value: number): number { return Number.isFinite(value) ? Math.min(30,Math.max(1,Math.round(value))) : 5; }
export function fxPositionClass(position: FxPosition): string {
  const map:Record<FxPosition,string> = {
    "top-left":"items-start justify-start",top:"items-start justify-center","top-right":"items-start justify-end",
    left:"items-center justify-start",center:"items-center justify-center",right:"items-center justify-end",
    "bottom-left":"items-end justify-start",bottom:"items-end justify-center","bottom-right":"items-end justify-end"
  };
  return map[position] ?? map.center;
}
export function classifyFxAfter(events: FxEvent[], lastId: number): FxEvent[] {
  return events.filter(event=>Number.isSafeInteger(event.id)&&event.id>lastId)
    .sort((a,b)=>a.id-b.id).filter((event,index,items)=>index===0||event.id!==items[index-1]?.id);
}

/** On the first OBS load, replay only events that are still within their
 * display lifetime; never replay old sounds when Browser Source reconnects. */
export function fxEventsForInitialOverlay(events: FxEvent[], nowMs: number): FxEvent[] {
  return classifyFxAfter(events, 0).filter((event) => {
    const at=event.createdAt?Date.parse(event.createdAt):NaN;
    if(!Number.isFinite(at))return false;
    const age=nowMs-at;
    if(age < -10_000)return false;
    const lifetime=event.command==="PLAY"
      ? fxSeconds(event.payload?.seconds??5)*1000
      : event.command==="TEST" ? 6000 : 15_000;
    return age <= lifetime;
  });
}
