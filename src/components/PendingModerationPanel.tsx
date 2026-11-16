import { Check, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceIcon } from "@/components/SourceIcon";
import type { QueueItem } from "@/lib/types";
interface Props { items: QueueItem[]; onReview: (id:string,approve:boolean)=>void; disabled?:boolean; }
export function PendingModerationPanel({items,onReview,disabled=false}:Props){
 if(!items.length)return null;
 return <section className="rounded-xl border border-amber-500/25 bg-amber-500/[0.035] p-3" aria-label="Pedidos aguardando aprovação">
  <div className="mb-3 flex items-center gap-2">
    <ShieldCheck className="size-4 text-amber-400" />
    <h2 className="flex-1 text-xs font-semibold">Aguardando aprovação</h2>
    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">{items.length}</span>
  </div>
  <div className="max-h-72 space-y-1 overflow-y-auto">
    {items.map(item=><div key={item.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 p-2">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
        {item.thumbnail?<img src={item.thumbnail} alt="" loading="lazy" className="size-full object-cover" />:<SourceIcon source={item.source} className="size-5" />}
      </div>
      <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold" title={item.title??"Pedido"}>{item.title??`Vídeo do ${item.source}`}</p>
        <p className="truncate text-[11px] text-muted-foreground">@{item.requestedBy} · {item.source}</p></div>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="rounded p-1.5 text-muted-foreground hover:text-foreground" title="Conferir vídeo original" aria-label="Conferir vídeo"><ExternalLink className="size-4"/></a>
      <Button type="button" size="icon" variant="ghost" className="size-8 text-emerald-400" disabled={disabled}
        title="Aprovar pedido" aria-label="Aprovar pedido" onClick={()=>onReview(item.id,true)}><Check className="size-4"/></Button>
      <Button type="button" size="icon" variant="ghost" className="size-8 text-destructive" disabled={disabled}
        title="Rejeitar pedido" aria-label="Rejeitar pedido" onClick={()=>onReview(item.id,false)}><X className="size-4"/></Button>
    </div>)}
  </div>
 </section>;
}
