import { useEffect, useRef, useState } from "react";
import { fxMediaUrl } from "@/lib/fx-api";
import { YouTubeStage, type StageControls } from "@/components/YouTubeStage";
import {
  fxPositionClass, normalizeFxVolume, parseFxYouTubeId,
  type FxKind, type FxPosition, type FxSize,
} from "@/lib/fx-validation";

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

interface Props { effect: FxPlayable; onDone?: () => void; onStarted?: () => void; preview?: boolean; }

export function FxMediaCanvas({ effect, onDone, onStarted, preview = false }: Props) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const onDoneRef=useRef(onDone);
  onDoneRef.current=onDone;
  const youtubeControlsRef = useRef<StageControls | null>(null);
  const [mediaIssue, setMediaIssue] = useState<string | null>(null);
  const [youtubeIssue, setYoutubeIssue] = useState<string | null>(null);
  const [mutedRetry, setMutedRetry] = useState(false);
  const [youtubeStarted, setYoutubeStarted] = useState(false);
  const url = fxMediaUrl({ media_path: effect.mediaPath ?? null, external_url: effect.externalUrl ?? null });
  const youtubeId = effect.externalUrl ? parseFxYouTubeId(effect.externalUrl) : null;
  const size = effect.size === "small" ? "max-w-[24%] max-h-[30%]" :
    effect.size === "large" ? "max-w-[80%] max-h-[80%]" : "max-w-[55%] max-h-[60%]";
  const volume = normalizeFxVolume(effect.volume) * normalizeFxVolume(effect.masterVolume) / 10000;
  const isNativeMedia = !youtubeId && (effect.mediaType === "audio" || effect.mediaType === "video");

  useEffect(() => {
    if (!youtubeId || youtubeStarted) return;
    const timer=window.setTimeout(()=>{
      setYoutubeIssue(previous=>previous??"O vídeo do YouTube não iniciou no OBS. Use Interagir na Fonte de Navegador para conferir o erro.");
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [youtubeId,youtubeStarted]);

  useEffect(() => {
    const element = mediaRef.current;
    if (!element || !isNativeMedia) return;
    element.volume = Math.max(0, Math.min(1, volume));
    element.muted = volume <= 0;
    void element.play().catch((error: unknown) => {
      const name = error instanceof Error ? error.name : "";
      setMediaIssue(name === "NotAllowedError"
        ? "O navegador do OBS bloqueou reprodução automática com som. Use 'Interagir' na Fonte de Navegador."
        : "Não foi possível iniciar este arquivo. Confira se o link é mídia direta e o formato é compatível.");
    });
  }, [url, volume, isNativeMedia]);

  useEffect(() => {
    if (youtubeId || effect.mediaType === "audio" || effect.mediaType === "video") return;
    const timeout = window.setTimeout(() => onDoneRef.current?.(), Math.max(1, Math.min(30, effect.seconds)) * 1000);
    return () => window.clearTimeout(timeout);
  }, [effect.mediaType, effect.seconds, youtubeId]);

  const reportMediaError = () => {
    const code = mediaRef.current?.error?.code;
    setMediaIssue(code === 4
      ? "Este arquivo não é reproduzível no navegador do OBS. Use MP4 H.264/AAC, WebM compatível ou áudio MP3."
      : "Falha ao carregar ou decodificar esta mídia. Verifique a URL e o formato do arquivo.");
  };

  const retryPlayback = () => {
    const element = mediaRef.current;
    if (!element) return;
    setMediaIssue(null);
    void element.play().catch(() => setMediaIssue("O navegador continua bloqueando o áudio. Verifique as propriedades da Fonte de Navegador no OBS."));
  };

  const canInteract = preview || Boolean(youtubeId) || isNativeMedia;
  return <div className={`${canInteract ? "pointer-events-auto" : "pointer-events-none"} absolute inset-0 flex p-[3%] ${fxPositionClass(effect.position)}`}>
    {youtubeId && <div className={`relative aspect-video max-h-[80%] overflow-hidden rounded-md bg-black ${
      effect.size === "small" ? "w-[35%] max-w-[480px]" :
      effect.size === "large" ? "w-[85%] max-w-[1440px]" : "w-[60%] max-w-[960px]"
    }`}>
      <div className={`size-full ${youtubeStarted ? "" : "pointer-events-none opacity-0"}`}>
      <YouTubeStage
        videoId={youtubeId}
        volume={Math.round(volume * 100)}
        muted={volume <= 0 || mutedRetry}
        paused={false}
        useIdentifiedEmbed
        controlsRef={youtubeControlsRef}
        onEnded={() => onDone?.()}
        onPlayingChange={playing => {
          if (playing) {
            if (!youtubeStarted) onStarted?.();
            setYoutubeStarted(true);
          }
          if (playing && mutedRetry) {
            setYoutubeIssue("Vídeo iniciado sem som. Use Interagir no OBS e clique em Ativar áudio.");
          } else if (playing) {
            setYoutubeIssue(null);
          }
        }}
        onProgress={() => {}}
        onPlayerError={code => {
          setYoutubeIssue(code === 153
            ? "YouTube recusou o navegador do OBS (erro 153). A identificação do iframe foi enviada; use arquivo MP4 se persistir."
            : code === 101 || code === 150
            ? "O dono deste vídeo bloqueou a incorporação fora do YouTube."
            : code === 100
            ? "Este vídeo não está disponível (removido ou privado)."
            : `YouTube não conseguiu reproduzir o vídeo (erro ${code}).`);
        }}
        onAutoplayBlocked={() => {
          if (mutedRetry) {
            setYoutubeIssue("Até a reprodução sem áudio foi bloqueada. Abra Interagir na fonte OBS e dê play no vídeo.");
            return;
          }
          setYoutubeIssue("Reprodução automática com som bloqueada. Tentando iniciar o vídeo sem áudio.");
          setMutedRetry(true);
          window.setTimeout(() => youtubeControlsRef.current?.play(), 350);
        }}
      />
      </div>
      {!youtubeStarted && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#100e16] px-5 text-center">
        <span className="size-6 animate-spin rounded-full border-2 border-violet-300/20 border-t-violet-300" aria-hidden="true"/>
        <span className="text-xs font-medium text-white/90">{youtubeIssue ? "Reprodução do YouTube indisponível" : "Preparando vídeo do YouTube…"}</span>
        <span className="max-w-sm text-[11px] leading-relaxed text-white/60">O YouTube pode exigir login ou confirmação antibot no navegador do OBS. Use MP4 autorizado para maior confiabilidade.</span>
      </div>}
    </div>}

    {youtubeId && youtubeIssue && <div role="alert" className="pointer-events-auto absolute inset-x-[6%] bottom-[5%] z-20 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-amber-400/40 bg-black/90 px-4 py-3 text-center text-sm text-amber-100 shadow-lg">
      <span>{youtubeIssue}</span>
      <button type="button" className="rounded bg-violet-300 px-3 py-1.5 font-semibold text-black"
        onClick={() => {
          if (mutedRetry) {
            setMutedRetry(false);
            youtubeControlsRef.current?.unmute();
          }
          youtubeControlsRef.current?.play();
          setYoutubeIssue(null);
        }}>
        {mutedRetry ? "Ativar áudio" : "Tentar reproduzir"}
      </button>
    </div>}

    {!youtubeId && url && (effect.mediaType === "image" || effect.mediaType === "gif") &&
      <img alt={effect.title} src={url} className={`${size} object-contain drop-shadow-[0_12px_32px_rgba(0,0,0,.45)]`} />}

    {!youtubeId && url && effect.mediaType === "video" &&
      <video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={url} autoPlay playsInline preload="auto"
        className={`${size} object-contain`} onPlaying={onStarted} onEnded={onDone} onError={reportMediaError} />}

    {!youtubeId && url && effect.mediaType === "audio" &&
      <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={url} autoPlay preload="auto"
        onPlaying={onStarted} onEnded={onDone} onError={reportMediaError} />}

    {isNativeMedia && mediaIssue && <div role="alert" className="pointer-events-auto absolute inset-x-[6%] bottom-[7%] z-20 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-amber-400/40 bg-black/90 px-4 py-3 text-center text-sm text-amber-100">
      <span>{mediaIssue}</span>
      <button type="button" className="rounded bg-violet-300 px-3 py-1.5 font-semibold text-black" onClick={retryPlayback}>Tentar tocar</button>
    </div>}

    {preview && <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 text-xs text-white/80">
      PRÉVIA · {effect.title}
    </span>}
  </div>;
}
