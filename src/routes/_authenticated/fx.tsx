import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AudioLines, Ban, CheckCircle2, Clapperboard, Clock3, Copy, ExternalLink, FileImage, Film, HardDriveUpload, Headphones, LoaderCircle, LockKeyhole, Plus, Radio, RefreshCw, Settings2, ShieldCheck, SlidersHorizontal, Trash2, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { MusicSidebar } from "@/components/MusicSidebar";
import { FxMediaCanvas } from "@/components/FxMediaCanvas";
import { fxCheckAccess, fxDb, fxMediaUrl } from "@/lib/fx-api";
import { FX_MEDIA_BUCKET, fxSeconds, identifyFxFile, normalizeFxVolume, validFxUrl, type FxEffect, type FxKind, type FxPosition, type FxSettings, type FxSize } from "@/lib/fx-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/fx")({
  ssr: false,
  head: () => ({ meta: [{ title: "RoceiraFX · music.chat" }, { name: "description", content: "Painel privado de efeitos para a transmissão da Roceira." }] }),
  component: FxStudioPage,
});

const DEFAULT_SETTINGS:FxSettings = {overlay_token:"",master_volume:80,cooldown_ms:750};
const positions:FxPosition[] = ["top-left","top","top-right","left","center","right","bottom-left","bottom","bottom-right"];
const icons: Record<FxKind,typeof AudioLines> = {audio:AudioLines,image:FileImage,gif:FileImage,video:Film};
const typeLabels:Record<FxKind,string>={audio:"Som",image:"Imagem",gif:"GIF",video:"Vídeo"};
function playback(effect:FxEffect, masterVolume:number) {
 return {title:effect.title,mediaType:effect.media_type,mediaPath:effect.media_path,
  externalUrl:effect.external_url,volume:effect.volume,masterVolume,
  seconds:effect.display_seconds,position:effect.position,size:effect.size};
}
async function inspectLocalVideo(file:File):Promise<void>{
 const url=URL.createObjectURL(file);
 try {
  const duration=await new Promise<number>((resolve,reject)=>{
    const video=document.createElement("video");
    video.preload="metadata";video.src=url;
    video.onloadedmetadata=()=>resolve(video.duration);
    video.onerror=()=>reject(new Error("Vídeo não pôde ser analisado"));
    window.setTimeout(()=>reject(new Error("Tempo excedido ao analisar o vídeo")),9000);
  });
  if(!Number.isFinite(duration)||duration>30)throw new Error("Vídeo deve ter até 30 segundos");
 } finally {URL.revokeObjectURL(url);}
}

function FxStudioPage(){
 const [ready,setReady]=useState(false);
 const [configured,setConfigured]=useState(false);
 const [allowed,setAllowed]=useState(false);
 const [admin,setAdmin]=useState(false);
 const [eligible,setEligible]=useState(false);
 const [error,setError]=useState("");
 const [settings,setSettings]=useState<FxSettings>(DEFAULT_SETTINGS);
 const [effects,setEffects]=useState<FxEffect[]>([]);
 const [history,setHistory]=useState<Array<{id:number;command:string;created_at:string}>>([]);
 const [tab,setTab]=useState<"soundboard"|"library"|"obs"|"settings">("soundboard");
 const [selected,setSelected]=useState<FxEffect|null>(null);
 const [preview,setPreview]=useState<FxEffect|null>(null);
 const [previewCount,setPreviewCount]=useState(0);
 const [filter,setFilter]=useState("");
 const [uploading,setUploading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [newUrl,setNewUrl]=useState("");
 const [newTitle,setNewTitle]=useState("");
 const [newType,setNewType]=useState<FxKind>("audio");
 const [memberEmail,setMemberEmail]=useState("");
 const [members,setMembers]=useState<string[]>([]);
 const fileRef=useRef<HTMLInputElement>(null);

 const refresh=useCallback(async()=>{
  const [media,config,events,permitted] = await Promise.all([
   fxDb.from("fx_effects").select("*").order("created_at",{ascending:false}).limit(150),
   fxDb.from("fx_settings").select("overlay_token,master_volume,cooldown_ms").eq("id",1).maybeSingle(),
   fxDb.from("fx_events").select("id,command,created_at").order("id",{ascending:false}).limit(20),
   fxDb.from("fx_members").select("user_id").limit(3),
  ]);
  if(media.error||config.error||events.error){setError(media.error?.message??config.error?.message??events.error?.message??"Erro ao carregar");return;}
  setError("");
  setEffects((media.data??[]) as FxEffect[]);
  if(config.data)setSettings(config.data as FxSettings);
  setHistory((events.data??[]) as Array<{id:number;command:string;created_at:string}>);
  setMembers((permitted.data??[]).map(v=>String(v.user_id)));
 },[]);

 useEffect(()=>{
  let live=true;
  void (async()=>{
   const result=await fxCheckAccess();
   if(!live)return;
   setConfigured(result.configured);setAllowed(result.allowed);setAdmin(result.admin);setEligible(result.eligible);setReady(true);
   if(result.allowed)await refresh();
  })();
  return()=>{live=false;};
 },[refresh]);

 const submitEffect=async(id:string)=>{
  const {error:emitError}=await fxDb.rpc("fx_fire",{p_effect_id:id});
  if(emitError){toast.error("Não foi possível tocar",{description:emitError.message});return;}
  toast.success("Enviado para a fonte do OBS");
  void refresh();
 };
 const command=async(value:"STOP_ALL"|"TEST")=>{
  const {error:emitError}=await fxDb.rpc("fx_command",{p_command:value});
  if(emitError){toast.error("Erro no comando",{description:emitError.message});return;}
  toast.success(value==="STOP_ALL"?"Todos os efeitos foram interrompidos":"Teste enviado à fonte do OBS");
  void refresh();
 };
 const handleUpload=async(file:File)=>{
  const inspected=identifyFxFile(file);
  if(inspected.error){toast.error(inspected.error);return;}
  setUploading(true);
  try {
   if(inspected.kind==="video")await inspectLocalVideo(file);
   const {data:auth}=await fxDb.auth.getUser();
   if(!auth.user)throw new Error("Faça login para enviar mídias.");
   const path=`${auth.user.id}/${crypto.randomUUID()}.${file.name.split(".").pop()!.toLowerCase()}`;
   const upload=await fxDb.storage.from(FX_MEDIA_BUCKET).upload(path,file,{contentType:file.type,upsert:false});
   if(upload.error)throw new Error(upload.error.message);
   const result=await fxDb.from("fx_effects").insert({
    title:file.name.replace(/\.[^.]+$/,"").slice(0,100),
    media_type:inspected.kind,media_path:path,created_by:auth.user.id,
    volume:80,display_seconds:5,position:"center",size:"medium"
   });
   if(result.error){
    await fxDb.storage.from(FX_MEDIA_BUCKET).remove([path]);
    throw new Error(result.error.message);
   }
   toast.success("Mídia adicionada ao soundboard");
   await refresh();setTab("soundboard");
  }catch(err){toast.error("Não foi possível enviar o arquivo",{description:String(err instanceof Error?err.message:err)});}
  finally {setUploading(false);if(fileRef.current)fileRef.current.value="";}
 };
 const handleUrl=async(e:FormEvent)=>{
  e.preventDefault();
  if(!validFxUrl(newUrl)){toast.error("Informe um link direto HTTPS válido.");return;}
  if(!newTitle.trim()){toast.error("Digite o nome do efeito.");return;}
  setSaving(true);
  const {data:auth}=await fxDb.auth.getUser();
  const result=await fxDb.from("fx_effects").insert({
   title:newTitle.trim().slice(0,100),media_type:newType,external_url:newUrl.trim(),
   created_by:auth.user?.id,volume:80,display_seconds:5,position:"center",size:"medium"
  });
  setSaving(false);
  if(result.error){toast.error("Não foi possível salvar",{description:result.error.message});return;}
  setNewUrl("");setNewTitle("");toast.success("Efeito adicionado");void refresh();
 };
 const remove=async(effect:FxEffect)=>{
  if(!window.confirm(`Apagar "${effect.title}" da biblioteca?`))return;
  const result=await fxDb.from("fx_effects").delete().eq("id",effect.id);
  if(result.error){toast.error("Não foi possível remover",{description:result.error.message});return;}
  if(effect.media_path)void fxDb.storage.from(FX_MEDIA_BUCKET).remove([effect.media_path]);
  setSelected(null);toast.success("Efeito removido");void refresh();
 };
 const saveEffect=async(effect:FxEffect)=>{
  setSaving(true);
  const result=await fxDb.from("fx_effects").update({
    title:effect.title.trim().slice(0,100),volume:normalizeFxVolume(effect.volume),
    display_seconds:fxSeconds(effect.display_seconds),position:effect.position,size:effect.size
  }).eq("id",effect.id);
  setSaving(false);
  if(result.error){toast.error("Erro ao salvar",{description:result.error.message});return;}
  setSelected(null);toast.success("Configuração salva");void refresh();
 };
 const changeSetting=async(patch:Partial<FxSettings>)=>{
  setSaving(true);
  const result=await fxDb.from("fx_settings").update(patch).eq("id",1);
  setSaving(false);
  if(result.error){toast.error("Erro ao salvar",{description:result.error.message});return;}
  setSettings(s=>({...s,...patch}));toast.success("Configurações salvas");
 };
 const handleInvite=async(enabled:boolean)=>{
  if(!memberEmail.includes("@")){toast.error("Digite o e-mail já cadastrado no music.chat.");return;}
  setSaving(true);
  const r=await fxDb.rpc("fx_set_member",{p_email:memberEmail.trim(),p_enabled:enabled});
  setSaving(false);
  if(r.error){toast.error("Não foi possível alterar acesso",{description:r.error.message});return;}
  toast.success(String(r.data??"Acesso atualizado"));void refresh();
 };
 const overlayUrl=typeof window!=="undefined"&&settings.overlay_token
  ? `${window.location.origin}/fx-overlay?key=${encodeURIComponent(settings.overlay_token)}`:"";
 const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);toast.success("Link copiado");}catch{toast.error("Não foi possível copiar");}};
 const filtered=effects.filter(x=>x.title.toLowerCase().includes(filter.trim().toLowerCase()));
 if(!ready)return <main className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin"/>Carregando RoceiraFX...</main>;
 if(!configured||!allowed)return <div className="music-shell"><MusicSidebar active="fx"/><main className="music-page min-h-screen px-6 py-16">
  <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8">
   <LockKeyhole className="mb-4 size-8 text-primary"/>
   <h1 className="text-2xl font-bold">{configured?"Acesso restrito":"RoceiraFX em configuração"}</h1>
   <p className="mt-3 text-sm leading-6 text-muted-foreground">{configured
    ?"Somente o proprietário do RoceiraFX e a conta convidada da Roceira podem usar este painel."
    :"A nova página está instalada, mas a migração do banco e do armazenamento ainda precisa ser aplicada. Nenhum efeito será disparado até o serviço estar pronto."}</p>
   {configured&&eligible&&<Button className="mt-5" onClick={async()=>{
      const claim=await fxDb.rpc("fx_claim_owner");
      if(claim.error||claim.data!==true){toast.error("Não foi possível ativar o RoceiraFX",{description:claim.error?.message??"Outra conta já é proprietária"});return;}
      toast.success("Seu acesso de proprietário foi ativado");
      window.location.reload();
   }}>Ativar meu acesso de proprietário</Button>}
   <Link className="mt-6 inline-flex text-sm text-primary hover:underline" to="/player">Voltar à sala de música</Link>
  </div></main></div>;

 return <div className="music-shell"><MusicSidebar active="fx"/>
  <main className="music-page min-h-screen max-w-none space-y-6 bg-[#0b0b10] px-5 py-7 text-foreground lg:px-8">
   <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
    <div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300">
      <span className="size-1.5 rounded-full bg-violet-400"/> Ferramentas para live · music.chat
    </div>
    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Roceira<span className="text-violet-300">FX</span> <span className="text-base font-normal text-muted-foreground">Studio</span></h1>
    <p className="mt-2 text-sm text-muted-foreground">Sons, imagens, GIFs e vídeos direto para o OBS da Roceira.</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={()=>void refresh()} className="gap-2"><RefreshCw className="size-4"/> Atualizar</Button>
      <Button variant="destructive" onClick={()=>void command("STOP_ALL")} className="gap-2"><Ban className="size-4"/> PARAR TUDO</Button>
    </div>
   </div>
   {error&&<div role="alert" className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">{error}</div>}
   <nav aria-label="Seções do RoceiraFX" className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1">
    {([["soundboard","Soundboard",AudioLines],["library","Biblioteca",HardDriveUpload],["obs","Fonte OBS",Radio],["settings","Configurações",Settings2]] as const).map(([id,label,Icon])=>
      <button key={id} type="button" onClick={()=>setTab(id)} aria-current={tab===id?"page":undefined}
       className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors ${tab===id?"bg-violet-300 text-zinc-950":"text-muted-foreground hover:bg-white/10 hover:text-white"}`}>
        <Icon className="size-4"/>{label}
      </button>)}
   </nav>
   {tab==="soundboard"&&<section>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Soundboard</h2><p className="mt-1 text-xs text-muted-foreground">{effects.length} efeitos disponíveis · pressione para enviar à live</p></div>
      <Input aria-label="Buscar efeito" placeholder="Buscar efeito..." className="w-full max-w-[260px] bg-card" value={filter} onChange={e=>setFilter(e.target.value)}/>
    </div>
    {filtered.length===0?<div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-12 text-center">
      <Headphones className="mx-auto size-10 text-violet-300"/><h3 className="mt-4 font-semibold">Nenhum efeito encontrado</h3>
      <p className="mt-2 text-sm text-muted-foreground">Adicione sons ou imagens na Biblioteca e eles aparecerão aqui.</p>
      <Button className="mt-5" onClick={()=>setTab("library")}><Plus className="mr-2 size-4"/> Adicionar efeito</Button>
    </div>:<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {filtered.map(effect=>{const Icon=icons[effect.media_type];return <div key={effect.id} className="group rounded-xl border border-white/10 bg-[#17151f] p-3 transition-colors hover:border-violet-300/45">
        <div className="relative mb-3 flex aspect-[5/3] items-center justify-center overflow-hidden rounded-lg bg-black/45">
          {(effect.media_type==="image"||effect.media_type==="gif")?<img src={fxMediaUrl(effect)} alt="" loading="lazy" className="size-full object-contain"/>:<Icon className="size-10 text-violet-300/75"/>}
        </div>
        <p title={effect.title} className="truncate text-sm font-semibold">{effect.title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{typeLabels[effect.media_type]} · {effect.volume}% vol.</p>
        <div className="mt-3 flex items-center gap-1">
         <Button size="sm" className="h-8 flex-1 bg-violet-300 text-xs text-black hover:bg-violet-200" onClick={()=>void submitEffect(effect.id)}>Tocar</Button>
         <Button size="icon" variant="ghost" className="size-8" aria-label={"Prévia de "+effect.title} title="Prévia" onClick={()=>{setPreview(effect);setPreviewCount(n=>n+1);}}><Clapperboard className="size-4"/></Button>
         <Button size="icon" variant="ghost" className="size-8" aria-label={"Editar "+effect.title} title="Editar" onClick={()=>setSelected({...effect})}><SlidersHorizontal className="size-4"/></Button>
        </div>
      </div>})}
    </div>}
   </section>}
   {tab==="library"&&<section className="grid gap-4 xl:grid-cols-2">
    <div className="rounded-2xl border border-white/10 bg-[#15141b] p-5">
      <HardDriveUpload className="size-7 text-violet-300"/><h2 className="mt-3 text-lg font-semibold">Enviar mídia</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">MP3, WAV, OGG, PNG, JPG, GIF, WebP, MP4 ou WebM. Vídeos de até 30 s. Arquivos ficam na biblioteca compartilhada.</p>
      <div className="mt-4 flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-violet-300/25 bg-violet-300/5 p-5 text-center"
        onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files[0])void handleUpload(e.dataTransfer.files[0]);}}>
        <input ref={fileRef} type="file" className="sr-only" id="fx-upload-file" accept=".mp3,.wav,.ogg,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm" onChange={e=>{if(e.target.files?.[0])void handleUpload(e.target.files[0]);}}/>
        <Button disabled={uploading} onClick={()=>fileRef.current?.click()}><Plus className="mr-2 size-4"/>{uploading?"Enviando...":"Escolher arquivo"}</Button>
        <p className="text-xs text-muted-foreground">Ou arraste o arquivo até aqui</p>
      </div>
    </div>
    <form onSubmit={e=>void handleUrl(e)} className="rounded-2xl border border-white/10 bg-[#15141b] p-5">
      <ExternalLink className="size-7 text-violet-300"/><h2 className="mt-3 text-lg font-semibold">Adicionar link direto</h2>
      <p className="mt-2 text-xs text-muted-foreground">Use um endereço HTTPS direto para o arquivo de áudio, imagem ou vídeo.</p>
      <label className="mt-5 block text-xs text-muted-foreground">Nome<Input className="mt-2" required maxLength={100} placeholder="Risada da Roceira" value={newTitle} onChange={e=>setNewTitle(e.target.value)}/></label>
      <label className="mt-3 block text-xs text-muted-foreground">URL da mídia<Input className="mt-2" required type="url" placeholder="https://exemplo.com/efeito.mp3" value={newUrl} onChange={e=>setNewUrl(e.target.value)}/></label>
      <label className="mt-3 block text-xs text-muted-foreground">Tipo<select className="mt-2 block h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={newType} onChange={e=>setNewType(e.target.value as FxKind)}>
       {(["audio","image","gif","video"] as FxKind[]).map(x=><option value={x} key={x}>{typeLabels[x]}</option>)}
      </select></label>
      <Button className="mt-5 w-full" disabled={saving}><Plus className="mr-2 size-4"/> Adicionar à biblioteca</Button>
    </form>
    {effects.length>0&&<div className="xl:col-span-2 rounded-xl border border-white/10 bg-card/50 p-4"><h3 className="mb-3 text-sm font-semibold">Biblioteca existente</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{effects.map(e=><button key={e.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/50 p-2 text-left hover:bg-muted/50" onClick={()=>setSelected({...e})}>
        {e.media_type==="audio"?<Volume2 className="size-5 text-primary"/>:e.media_type==="video"?<Film className="size-5 text-primary"/>:<FileImage className="size-5 text-primary"/>}
        <span className="min-w-0 flex-1 truncate text-xs">{e.title}</span><SlidersHorizontal className="size-3 text-muted-foreground"/>
      </button>)}</div>
    </div>}
   </section>}
   {tab==="obs"&&<section className="max-w-3xl space-y-4">
    <div className="rounded-2xl border border-white/10 bg-[#15141b] p-6">
      <Radio className="size-7 text-violet-300"/><h2 className="mt-3 text-xl font-semibold">Conectar ao OBS</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Na live da Roceira, adicione uma única <b>Fonte de Navegador</b> com a URL abaixo, em 1920 × 1080. O fundo fica transparente e os sons são reproduzidos nessa fonte.</p>
      <div className="mt-5 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-black/30 p-3">
       <code className="min-w-0 flex-1 truncate text-xs text-violet-200">{overlayUrl?"•••••••••••••••••••• (link privado)":"Nenhuma URL disponível"}</code>
       <Button variant="outline" size="sm" onClick={()=>void copy(overlayUrl)} disabled={!overlayUrl}><Copy className="mr-2 size-4"/> Copiar URL do OBS</Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
       <Button variant="secondary" onClick={()=>void command("TEST")}><CheckCircle2 className="mr-2 size-4"/> Testar a fonte</Button>
       {admin&&<Button variant="outline" onClick={async()=>{if(!confirm("O link antigo deixará de funcionar no OBS. Continuar?"))return;const result=await fxDb.rpc("fx_rotate_token");if(result.error){toast.error(result.error.message);return;}toast.success("URL renovada. Atualize no OBS.");void refresh();}}>Gerar nova URL</Button>}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">A URL é uma chave de leitura da fonte OBS. Não compartilhe publicamente. A fonte precisa estar aberta para receber efeitos.</p>
    </div>
   </section>}
   {tab==="settings"&&<section className="grid gap-4 lg:grid-cols-2">
     <div className="rounded-2xl border border-white/10 bg-[#15141b] p-5">
      <Settings2 className="size-6 text-violet-300"/><h2 className="mt-3 text-lg font-semibold">Áudio e velocidade</h2>
      <label className="mt-5 block text-xs text-muted-foreground">Volume geral: {settings.master_volume}%
        <input type="range" min={0} max={100} step={1} value={settings.master_volume} disabled={!admin||saving}
          onChange={e=>setSettings(s=>({...s,master_volume:Number(e.target.value)}))}
          onPointerUp={()=>void changeSetting({master_volume:settings.master_volume})}
          onKeyUp={()=>void changeSetting({master_volume:settings.master_volume})}
          className="mt-3 w-full accent-violet-300"/>
      </label>
      <label className="mt-5 block text-xs text-muted-foreground">Intervalo entre efeitos (ms)
        <Input type="number" min={0} max={15000} step={250} className="mt-2" disabled={!admin}
          value={settings.cooldown_ms} onChange={e=>setSettings(s=>({...s,cooldown_ms:Number(e.target.value)}))}/>
      </label>
      <Button className="mt-4" disabled={!admin||saving} onClick={()=>void changeSetting({cooldown_ms:Math.min(15000,Math.max(0,settings.cooldown_ms)),master_volume:normalizeFxVolume(settings.master_volume)})}>Salvar configurações</Button>
     </div>
     <div className="rounded-2xl border border-white/10 bg-[#15141b] p-5">
      <ShieldCheck className="size-6 text-violet-300"/><h2 className="mt-3 text-lg font-semibold">Quem pode usar?</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Somente você (proprietário) e uma conta extra autorizada. A Roceira precisa criar a conta antes de receber o convite.</p>
      <p className="mt-4 text-xs text-muted-foreground">Contas extras cadastradas: {members.length}/1</p>
      {admin&&<><label className="mt-4 block text-xs text-muted-foreground">E-mail da Roceira<Input type="email" className="mt-2" value={memberEmail} onChange={e=>setMemberEmail(e.target.value)} placeholder="Email cadastrado no music.chat"/></label>
       <div className="mt-4 flex gap-2">
        <Button disabled={saving||!memberEmail} onClick={()=>void handleInvite(true)}>Autorizar</Button>
        <Button disabled={saving||!memberEmail} variant="outline" onClick={()=>void handleInvite(false)}>Revogar</Button>
       </div></>}
     </div>
     <div className="rounded-2xl border border-white/10 bg-[#15141b] p-5 lg:col-span-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-primary"/> Últimos comandos</h3>
      <div className="mt-3 space-y-2">{history.map(event=><div className="flex justify-between gap-3 border-b border-border/50 py-1 text-xs" key={event.id}>
       <span>{event.command==="PLAY"?"Efeito disparado":event.command==="STOP_ALL"?"Parar tudo":"Teste de conexão"}</span>
       <span className="text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</span>
      </div>)}{history.length===0&&<p className="text-xs text-muted-foreground">Nenhum comando enviado ainda.</p>}</div>
     </div>
   </section>}
   {preview&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-5" role="dialog" aria-modal="true" aria-label="Prévia do efeito">
     <div className="w-full max-w-3xl"><div className="mb-2 flex justify-between text-sm"><span>Prévia: {preview.title}</span><button aria-label="Fechar prévia" onClick={()=>setPreview(null)}><X className="size-5"/></button></div>
       <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black" key={previewCount}>
        <FxMediaCanvas effect={playback(preview,settings.master_volume)} preview onDone={()=>setPreview(null)}/>
       </div>
     </div></div>}
   {selected&&<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Editar efeito">
    <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl border border-white/15 bg-[#16141e] p-5 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Configurar efeito</h2><button aria-label="Fechar editor" onClick={()=>setSelected(null)}><X className="size-5"/></button></div>
      <label className="block text-xs text-muted-foreground">Nome<Input className="mt-2" maxLength={100} value={selected.title} onChange={e=>setSelected({...selected,title:e.target.value})}/></label>
      <label className="block text-xs text-muted-foreground">Volume: {selected.volume}%<input type="range" min={0} max={100} value={selected.volume} className="mt-2 w-full accent-violet-300" onChange={e=>setSelected({...selected,volume:Number(e.target.value)})}/></label>
      <label className="block text-xs text-muted-foreground">Duração para imagens e GIFs (1–30 s)<Input type="number" min={1} max={30} className="mt-2" value={selected.display_seconds} onChange={e=>setSelected({...selected,display_seconds:Number(e.target.value)})}/></label>
      <label className="block text-xs text-muted-foreground">Tamanho<select className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3" value={selected.size} onChange={e=>setSelected({...selected,size:e.target.value as FxSize})}>
        <option value="small">Pequeno</option><option value="medium">Médio</option><option value="large">Grande</option>
      </select></label>
      <div><p className="mb-2 text-xs text-muted-foreground">Posição na transmissão</p><div className="grid w-40 grid-cols-3 gap-1">
       {positions.map(pos=><button key={pos} type="button" onClick={()=>setSelected({...selected,position:pos})} title={pos} aria-label={pos} aria-pressed={selected.position===pos}
         className={`size-11 rounded border ${selected.position===pos?"border-violet-300 bg-violet-300/20":"border-white/10 bg-white/5 hover:bg-white/10"}`}>
         <span className="mx-auto block size-1.5 rounded-full bg-violet-200"/>
       </button>)}
      </div></div>
      <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
       <Button onClick={()=>void saveEffect(selected)} disabled={saving||!selected.title.trim()}>Salvar efeito</Button>
       <Button variant="outline" onClick={()=>{setPreview(selected);setPreviewCount(n=>n+1);}}>Prévia</Button>
       <Button variant="destructive" className="ml-auto" onClick={()=>void remove(selected)}><Trash2 className="mr-2 size-4"/> Remover</Button>
      </div>
    </div>
   </div>}
  </main>
 </div>;
}
