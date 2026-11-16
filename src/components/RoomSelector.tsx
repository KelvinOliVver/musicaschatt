import { useCallback, useEffect, useState } from "react";
import { Plus, Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeRoomSlug } from "@/lib/room-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props { active: string; onSelect: (channel: string) => void; }
export function RoomSelector({active,onSelect}:Props){
 const [rooms,setRooms]=useState<string[]>([]);
 const [newRoom,setNewRoom]=useState("");
 const [editing,setEditing]=useState(false);
 const [busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
   const {data,error}=await supabase.from("streamer_rooms").select("slug").order("slug");
   if(error){console.warn("[ROOMS]",error.message);return;}
   setRooms((data??[]).map(x=>x.slug));
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const create=async()=>{
   const slug=normalizeRoomSlug(newRoom);
   if(!slug){toast.error("Informe o nick do canal da Kick.");return;}
   setBusy(true);
   const {data,error}=await supabase.rpc("create_streamer_room",{p_slug:slug});
   setBusy(false);
   if(error||!data){toast.error("Não foi possível criar a sala.",{description:error?.message});return;}
   onSelect(data);
   setEditing(false);setNewRoom("");
   void refresh();
   toast.success(`Sala @${slug} conectada.`);
 };
 return <div className="flex min-w-0 flex-wrap items-center gap-2">
   <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
     <Radio className="size-3.5 shrink-0 text-primary" aria-hidden/>
     <span className="sr-only">Sala da Kick</span>
     <select aria-label="Selecionar sala de streamer" value={active}
       onChange={e=>onSelect(e.target.value)}
       className="h-8 max-w-[180px] rounded-md border border-border bg-background px-2 text-xs text-foreground">
       {!rooms.includes(active)&&<option value={active}>@{active}</option>}
       {rooms.map(room=><option key={room} value={room}>@{room}</option>)}
     </select>
   </label>
   <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs"
     onClick={()=>setEditing(v=>!v)} aria-expanded={editing}>
     <Plus className="size-3.5" /> Nova sala
   </Button>
   {editing && <form onSubmit={e=>{e.preventDefault();void create();}} className="flex gap-1.5">
      <Input value={newRoom} onChange={e=>setNewRoom(e.target.value)} placeholder="Nick do canal"
        aria-label="Nick do novo streamer" maxLength={41} className="h-8 w-36" />
      <Button type="submit" size="sm" className="h-8" disabled={busy||!newRoom.trim()}>
        {busy?"Criando...":"Criar"}
      </Button>
   </form>}
 </div>;
}
