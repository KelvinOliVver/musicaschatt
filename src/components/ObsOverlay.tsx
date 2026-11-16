import type { QueueItem } from "@/lib/types";
import type { PlaybackSyncState } from "@/lib/player-sync";
import { projectedPlaybackTime } from "@/lib/player-sync";
export type OverlayMode = "none" | "now" | "next" | "progress" | "all";
interface Props {
 mode: OverlayMode;
 current: QueueItem | null;
 nextTitle?: string | null;
 nextRequester?: string | null;
 sync: PlaybackSyncState | null;
 now: number;
}
const durationLabel=(seconds:number)=>{
 const n=Math.max(0,Math.floor(seconds));
 return `${Math.floor(n/60)}:${(n%60).toString().padStart(2,"0")}`;
};
export function ObsOverlay({mode,current,nextTitle,nextRequester,sync,now}:Props) {
 if(mode==="none"||!current)return null;
 const time=sync?projectedPlaybackTime(sync,now):current.playbackPosition;
 const total=current.durationSeconds??0;
 const percent=total>0?Math.max(0,Math.min(100,time/total*100)):0;
 return <aside aria-label="Informações da transmissão" className="obs-overlay pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 p-5 text-white">
   <div className="flex items-end justify-between gap-3">
    {(mode==="now"||mode==="all") && <div className="max-w-[65%] min-w-0 rounded-lg border border-white/10 bg-black/75 p-3 shadow-lg backdrop-blur-md">
     <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-300">Tocando agora</div>
     <div className="mt-1 truncate text-sm font-semibold">{current.title??`Vídeo do ${current.source}`}</div>
     <div className="mt-0.5 truncate text-xs text-white/70">Pedido por {current.requestedBy}</div>
    </div>}
    {(mode==="next"||mode==="all")&&nextTitle&&<div className="ml-auto min-w-0 max-w-[38%] rounded-lg border border-white/10 bg-black/75 p-3 text-right shadow-lg backdrop-blur-md">
     <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-300">A seguir</div>
     <div className="mt-1 truncate text-sm font-medium">{nextTitle}</div>
     {nextRequester&&<div className="mt-0.5 truncate text-xs text-white/70">{nextRequester}</div>}
    </div>}
   </div>
   {(mode==="progress"||mode==="all")&&total>0&&<div className="rounded-md bg-black/75 px-3 py-2 shadow-lg backdrop-blur-md">
     <div className="mb-1 flex justify-between text-[10px] tabular-nums text-white/85">
       <span>{durationLabel(time)}</span><span>{durationLabel(total)}</span>
     </div>
     <div className="h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-violet-300" style={{width:`${percent}%`}} /></div>
   </div>}
 </aside>;
}
