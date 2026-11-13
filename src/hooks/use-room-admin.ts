import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Read-only check. Never claim the host lease from the settings page. */
export function useRoomAdmin() {
  const [isRoomAdmin, setIsRoomAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    async function check() {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) {
        setIsRoomAdmin(false);
        setChecking(false);
        return;
      }
      // Generated schema will include this table after the controlled rollout.
      const { data, error } = await (supabase as any)
        .from("music_room_admins")
        .select("user_id")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (!active) return;
      setIsRoomAdmin(!error && Boolean(data));
      setChecking(false);
    }
    void check();
    return () => { active = false; };
  }, []);
  return { isRoomAdmin, checking };
}
