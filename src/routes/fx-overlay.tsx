import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { FxMediaCanvas, type FxPlayable } from "@/components/FxMediaCanvas";
import { fxDb } from "@/lib/fx-api";
import { classifyFxAfter, fxEventsForInitialOverlay, parseFxYouTubeId, type FxEvent } from "@/lib/fx-validation";

export const Route = createFileRoute("/fx-overlay")({
 ssr:false,
 head:()=>({meta:[{title:"RoceiraFX · OBS Overlay"}]}),
 component:FxOverlay,
});
interface OverlayResult { latest:number;events:FxEvent[]; }
interface ActiveFx { id:number; effect:FxPlayable; expiresAt:number; }
function FxOverlay(){
 const [active,setActive]=useState<ActiveFx[]>([]);
 const [invalid,setInvalid]=useState(false);
 const [error,setError]=useState("");
 const lastRef=useRef<number|null>(null);
 const busyRef=useRef(false);
 const effectTimers=useRef(new Map<number,number>());
 const startedIdsRef=useRef(new Set<number>());
 const token=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("key"):"";
 const stopAll=useCallback(()=>{
  effectTimers.current.forEach(timer=>window.clearTimeout(timer));
  effectTimers.current.clear();startedIdsRef.current.clear();setActive([]);
 },[]);
 const dismiss=useCallback((id:number)=>{
  const timeout=effectTimers.current.get(id);
  if(timeout)window.clearTimeout(timeout);
  effectTimers.current.delete(id);
  startedIdsRef.current.delete(id);
  setActive(curr=>curr.filter(item=>item.id!==id));
 },[]);
 const handleMediaStarted=useCallback((id:number,seconds:number)=>{
  if(startedIdsRef.current.has(id))return;
  startedIdsRef.current.add(id);
  const previous=effectTimers.current.get(id);
  if(previous!==undefined)window.clearTimeout(previous);
  // Start the requested effect duration only after playback actually starts.
  const duration=Math.max(1,Math.min(30,seconds));
  const timer=window.setTimeout(()=>dismiss(id),duration*1000);
  effectTimers.current.set(id,timer);
 },[dismiss]);
 useEffect(()=>{
  const root=document.documentElement;
  const body=document.body;
  const element=document.getElementById("root");
  const prev=[root.style.background,body.style.background,element?.style.background??""];
  root.style.background="transparent";body.style.background="transparent";
  if(element)element.style.background="transparent";
  return()=>{root.style.background=prev[0]??"";body.style.background=prev[1]??"";if(element)element.style.background=prev[2]??"";};
 },[]);
 useEffect(()=>{
  if(!token || !/^[a-fA-F0-9-]{36}$/.test(token)){setInvalid(true);return;}
  let mounted=true;
  let tick:ReturnType<typeof setInterval>|undefined;
  async function poll(){
    if(busyRef.current||!mounted)return;
    busyRef.current=true;
    try {
      // Passing NULL returns only a cursor. A fresh OBS Browser Source could
      // miss a PLAY fired seconds earlier, so fetch recent events on first load.
      const firstLoad=lastRef.current===null;
      const {data,error:pollError}=await fxDb.rpc("fx_overlay_poll",{p_key:token,p_after:firstLoad?0:lastRef.current});
      if(!mounted)return;
      if(pollError){setError("Sem conexão com a fonte RoceiraFX");return;}
      if(!data){setInvalid(true);stopAll();return;}
      setInvalid(false);setError("");
      const payload=data as OverlayResult;
      if(!Number.isSafeInteger(payload.latest))return;
      const incoming=firstLoad
        ? fxEventsForInitialOverlay(payload.events??[],Date.now())
        : classifyFxAfter(payload.events??[],lastRef.current??0);
      for(const event of incoming){
        if(event.command==="STOP_ALL"){stopAll();continue;}
        if(event.command==="TEST"){
          const info:FxPlayable={title:"Conexão ativa",mediaType:"image",
            externalUrl:null,mediaPath:null,volume:0,masterVolume:0,seconds:2,
            position:"center",size:"small"};
          setActive(items=>[...items.slice(-3),{id:event.id,effect:info,expiresAt:Date.now()+5000}]);
          const timeout=window.setTimeout(()=>dismiss(event.id),5000);
          effectTimers.current.set(event.id,timeout);
          continue;
        }
        if(event.command!=="PLAY"||!event.payload)continue;
        const p=event.payload;
        if(!p.mediaPath&&!p.externalUrl)continue;
        if(!["audio","image","gif","video"].includes(p.mediaType??""))continue;
        const effect:FxPlayable={
          title:p.title??"Efeito da live",
          mediaType:p.mediaType!,
          mediaPath:p.mediaPath??null,externalUrl:p.externalUrl??null,
          volume:p.volume??80,masterVolume:p.masterVolume??80,
          seconds:p.seconds??5,position:p.position??"center",size:p.size??"medium",
        };
        // Never replay old media after reconnect, and never keep stale timers.
        const ageMs=event.createdAt?Math.max(0,Date.now()-Date.parse(event.createdAt)||0):0;
        const duration=Math.max(1,Math.min(30,effect.seconds));
        const remainingMs=duration*1000-ageMs;
        if(remainingMs<=0)continue;
        // YouTube's iframe needs time to initialize in OBS/CEF. Do not close
        // five-second legacy links before the first video frame starts.
        const isYouTube=Boolean(p.externalUrl&&parseFxYouTubeId(p.externalUrl));
        const startupAllowanceMs=isYouTube?12000:0;
        setActive(items=>[...items.slice(-3),{id:event.id,effect,expiresAt:Date.now()+remainingMs+startupAllowanceMs}]);
        const timer=window.setTimeout(()=>dismiss(event.id),remainingMs+startupAllowanceMs);
        effectTimers.current.set(event.id,timer);
      }
      lastRef.current=Math.max(payload.latest,lastRef.current??0);
    }catch{if(mounted)setError("Não foi possível alcançar o serviço de efeitos");}
    finally{busyRef.current=false;}
  }
  void poll();
  tick=window.setInterval(()=>void poll(),1100);
  const onFocus=()=>void poll();
  window.addEventListener("pageshow",onFocus);
  return()=>{mounted=false;if(tick)window.clearInterval(tick);window.removeEventListener("pageshow",onFocus);stopAll();};
 },[token,stopAll,dismiss]);
 return <main className="fixed inset-0 isolate overflow-hidden bg-transparent" aria-label="RoceiraFX overlay">
  {active.map(item=>item.effect.mediaPath||item.effect.externalUrl
   ? <FxMediaCanvas key={item.id} effect={item.effect} onDone={()=>dismiss(item.id)} onStarted={()=>handleMediaStarted(item.id,item.effect.seconds)}/>
   : <div key={item.id} className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="rounded-2xl border border-violet-300/50 bg-black/75 px-9 py-7 text-4xl font-bold text-white shadow-2xl">RoceiraFX conectado ✓</span>
    </div>)}
  {(invalid||error)&&<div className="pointer-events-none absolute left-5 top-5 flex items-center gap-2 rounded-md bg-black/65 px-3 py-2 text-xs text-white/80">
   <AlertTriangle className="size-4 text-amber-300"/>{invalid?"Chave OBS inválida ou revogada":error}
  </div>}
 </main>;
}
