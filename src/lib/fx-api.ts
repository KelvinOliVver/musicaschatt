import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { FX_MEDIA_BUCKET, type FxEffect } from "./fx-validation";

// The FX schema has its own migration; the generated music.chat database
// types will pick up these tables after that migration is applied.
export const fxDb = supabase as unknown as SupabaseClient;
export function fxMediaUrl(effect: Pick<FxEffect,"media_path"|"external_url">): string {
  if (effect.external_url) return effect.external_url;
  if (!effect.media_path) return "";
  return fxDb.storage.from(FX_MEDIA_BUCKET).getPublicUrl(effect.media_path).data.publicUrl;
}
export async function fxCheckAccess(): Promise<{allowed:boolean;admin:boolean;configured:boolean;eligible:boolean}> {
  const [member,admin] = await Promise.all([fxDb.rpc("fx_is_allowed"),fxDb.rpc("fx_is_admin")]);
  if (member.error || admin.error) return {allowed:false,admin:false,configured:false,eligible:false};
  const {data:auth}=await fxDb.auth.getUser();
  const candidate=auth.user && member.data!==true ? await fxDb.rpc("has_role",{_role:"admin",_user_id:auth.user.id}) : null;
  return {allowed:member.data===true,admin:admin.data===true,configured:true,eligible:candidate?.data===true};
}
