import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, LoaderCircle, ExternalLink } from "lucide-react";
import { parseTrackInput } from "@/lib/link-parser";
import { inspectTrack, type InspectionResult } from "@/lib/track-inspection.functions";
interface Props { url:string; }
export function TrackPreview({url}:Props){
 const [state,setState]=useState<{key:string;info:InspectionResult}|null>(null);
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
   const text=url.trim();const track=parseTrackInput(text);
   if(!track){setState(null);setLoading(false);return;}
   let active=true;
   setLoading(true);
   const timer=window.setTimeout(()=>{
      void inspectTrack({data:track}).then(info=>{if(active)setState({key:text,info});})
        .catch(()=>{if(active)setState({key:text,info:{status:"unverified",title:null,author:null,thumbnail:null,reason:"Prévia indisponível"}});})
        .finally(()=>{if(active)setLoading(false);});
   },500);
   return()=>{active=false;clearTimeout(timer);};
 },[url]);
 if(!url.trim()||!parseTrackInput(url.trim()))return null;
 const info=state?.key===url.trim()?state.info:null;
 return <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 text-xs">
  {loading||!info?<LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground"/>:
   info.status==="available"?<CheckCircle2 className="size-4 shrink-0 text-emerald-400"/>:
   <AlertTriangle className="size-4 shrink-0 text-amber-400"/>}
  {info?.thumbnail && <img src={info.thumbnail} alt="" loading="lazy" className="size-9 shrink-0 rounded object-cover" />}
  <div className="min-w-0 flex-1">
    <p className="truncate font-medium">{loading?"Verificando link...":info?.title??"Prévia do vídeo"}</p>
    <p className="truncate text-[11px] text-muted-foreground">{info?.status==="available"?"Dados encontrados; reprodução ainda depende da plataforma":info?.reason??"Checando disponibilidade e título"}</p>
  </div>
  <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir original" className="shrink-0 text-muted-foreground hover:text-foreground"><ExternalLink className="size-4"/></a>
 </div>;
}
