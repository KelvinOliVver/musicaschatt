import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The Music Chat project already has user_roles and the has_role RPC.
 * Do not create another admin system or decide admin rights from public
 * Presence, display names, emails, or client-side metadata.
 */
export function useRoomAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setIsAdmin(false);
      setChecking(false);
      return;
    }

    const { data, error } = await supabase.rpc("has_role", {
      _user_id: auth.user.id,
      _role: "admin",
    });
    if (error) console.error("[MUSIC ADMIN ROLE]", error.message);
    setIsAdmin(!error && data === true);
    setChecking(false);
  }, []);

  useEffect(() => {
    let active = true;
    void refresh();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      if (!active) return;
      setChecking(true);
      // Avoid the Supabase auth callback deadlock by scheduling asynchronously.
      window.setTimeout(() => {
        if (active) void refresh();
      }, 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [refresh]);

  return { isAdmin, checking, refresh };
}
