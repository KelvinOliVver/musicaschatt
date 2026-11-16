import { createServerFn } from "@tanstack/react-start";
import type { TrackSource } from "./types";
export type InspectionStatus = "available" | "unverified" | "unavailable";
export interface InspectionResult {
 status: InspectionStatus;
 title: string | null;
 author: string | null;
 thumbnail: string | null;
 reason: string | null;
}
const lookupCache=new Map<string,{until:number,result:InspectionResult}>();
const empty=(reason:string|null=null):InspectionResult=>({status:"unverified",title:null,author:null,thumbnail:null,reason});
export const inspectTrack = createServerFn({method:"GET"})
 .inputValidator((input:{source:TrackSource;trackId:string;url:string})=>{
   if (!["youtube","instagram","tiktok"].includes(input.source)) throw new Error("Plataforma inválida");
   if (!/^[a-zA-Z0-9_-]{1,40}$/.test(input.trackId)) throw new Error("ID inválido");
   const parsed=new URL(input.url);
   if (parsed.protocol!=="https:") throw new Error("Link inválido");
   const host=parsed.hostname.replace(/^www\./,"").toLowerCase();
   const allow:Record<TrackSource,string[]>={
     youtube:["youtube.com","m.youtube.com","music.youtube.com","youtu.be"],
     instagram:["instagram.com"],
     tiktok:["tiktok.com","m.tiktok.com","vm.tiktok.com","vt.tiktok.com"],
   };
   if(!allow[input.source].includes(host))throw new Error("Domínio não permitido");
   return {...input,url:parsed.href};
 })
 .handler(async ({data}):Promise<InspectionResult>=>{
   const key=data.source+":"+data.trackId;
   const found=lookupCache.get(key);
   if(found&&found.until>Date.now())return found.result;
   let result=empty("Não foi possível confirmar a reprodução antes de abrir o player");
   if(data.source==="instagram"){
     result=empty("Instagram exige acesso ao vídeo no próprio player");
   } else {
     const url=data.source==="youtube"
       ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v="+data.trackId)}`
       : `https://www.tiktok.com/oembed?url=${encodeURIComponent(data.url)}`;
     try {
       const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(4800)});
       if(response.ok){
         const v=await response.json() as {title?:string;author_name?:string;thumbnail_url?:string};
         result={status:"available",title:v.title?.trim()||null,author:v.author_name?.trim()||null,thumbnail:v.thumbnail_url||null,reason:null};
       } else if(data.source==="youtube"&&(response.status===404||response.status===401)){
         result={status:"unavailable",title:null,author:null,thumbnail:null,reason:"YouTube não disponibilizou este vídeo (privado, removido ou indisponível)"};
       } else result=empty("Plataforma não confirmou a disponibilidade");
     }catch{result=empty("Verificação temporariamente indisponível");}
   }
   lookupCache.set(key,{until:Date.now()+ (result.status==="available"?5*60_000:90_000),result});
   if(lookupCache.size>1000){const first=lookupCache.keys().next().value;if(first)lookupCache.delete(first);}
   return result;
 });
