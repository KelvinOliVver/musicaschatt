import { useEffect, useRef, useState } from "react";
import { fxMediaUrl } from "@/lib/fx-api";
import { YouTubeStage } from "@/components/YouTubeStage";
import { fxPositionClass, normalizeFxVolume, parseFxYouTubeId, type FxKind, type FxPosition, type FxSize } from "@/lib/fx-validation";

export interface FxPlayable {
  title: string;
  mediaType: FxKind;
  mediaPath?: string | null;
  externalUrl?: string | null;
  volume: number;
  masterVolume: number;
  seconds: number;
  position: FxPosition;
  size: FxSize;
}
interface Props { effect: FxPlayable; onDone?: () => void; preview?: boolean; }
export function FxMediaCanvas({ effect, onDone, preview=false }: Props) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [autoplayFailed,setAutoplayFailed] = useState(false);
  const [youtubeIssue,setYoutubeIssue] = useState<string | null>(null);
  const url = fxMediaUrl({media_path:effect.mediaPath??null,external_url:effect.externalUrl??null});
  const youtubeId = effect.externalUrl ? parseFxYouTubeId(effect.externalUrl) : null;
  const size = effect.size==="small" ? "max-w-[24%] max-h-[30%]" :
    effect.size==="large" ? "max-w-[80%] max-h-[80%]" : "max-w-[55%] max-h-[60%]";
  const volume = normalizeFxVolume(effect.volume)*normalizeFxVolume(effect.masterVolume)/10000;
  useEffect(()=>{
    const element=mediaRef.current;
    if (!element) return;
    element.volume=Math.max(0,Math.min(1,volume));
    element.muted=volume<=0;
    void element.play().catch(()=>setAutoplayFailed(true));
  },[url,volume]);
  useEffect(()=>{
    if (youtubeId || effect.mediaType==="audio"||effect.mediaType==="video") return;
    const timeout=window.setTimeout(()=>onDone?.(),Math.max(1,Math.min(30,effect.seconds))*1000);
    return ()=>clearTimeout(timeout);
  },[effect.mediaType,effect.seconds,onDone,youtubeId]);
  return <div className={`${preview?"pointer-events-auto":"pointer-events-none"} absolute inset-0 flex p-[3%] ${fxPositionClass(effect.position)}`}>
    {youtubeId && <div className={`aspect-video max-h-[80%] overflow-hidden rounded-md bg-black ${
      effect.size==="small" ? "w-[35%] max-w-[480px]" :
      effect.size==="large" ? "w-[85%] max-w-[1440px]" : "w-[60%] max-w-[960px]"
    }`}>
      <YouTubeStage videoId={youtubeId} volume={Math.round(volume*100)}
        muted={volume===0} paused={false} onEnded={()=>onDone?.()}
        onPlayingChange={()=>{}} onProgress={()=>{}}
        onPlayerError={(code)=>{
          setYoutubeIssue(code===153
            ? "O YouTube bloqueou o vídeo no OBS (erro 153: identificação da página)."
            : code===101||code===150
            ? "O dono do vídeo não permite reprodução incorporada."
            : code===100
            ? "O vídeo foi removido ou está privado."
            : `O YouTube não conseguiu reproduzir este vídeo (erro ${code}).`);
        }}
        onAutoplayBlocked={()=>{
          setYoutubeIssue("O YouTube bloqueou a reprodução automática com som.");
        }}
      />
    </div>}
    {youtubeId && youtubeIssue && <div role="status" className="absolute inset-x-[6%] bottom-[8%] z-10 rounded-lg border border-amber-400/40 bg-black/90 px-4 py-3 text-center text-sm font-medium text-amber-100 shadow-lg">
      {youtubeIssue}
    </div>}
    {!youtubeId && url && (effect.mediaType==="image"||effect.mediaType==="gif") &&
      <img alt={effect.title} src={url} className={`${size} object-contain drop-shadow-[0_12px_32px_rgba(0,0,0,.45)]`} />}
    {!youtubeId && url && effect.mediaType==="video" &&
      <video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={url} autoPlay playsInline
        className={`${size} object-contain`} onEnded={onDone} onError={onDone} />}
    {!youtubeId && url && effect.mediaType==="audio" &&
      <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={url} autoPlay
        onEnded={onDone} onError={onDone} />}
    {preview && <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 text-xs text-white/80">
      PRÉVIA · {effect.title}
    </span>}
    {autoplayFailed && preview && <span className="absolute bottom-3 right-3 rounded-md bg-amber-400/20 px-2 py-1 text-xs text-amber-200">
      Clique na mídia para liberar o áudio no navegador
    </span>}
  </div>;
}
