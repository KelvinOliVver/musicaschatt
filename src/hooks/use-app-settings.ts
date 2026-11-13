import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AppSettings {
  chatCooldownSeconds: number;
  blockedUsernames: string[];
}

const DEFAULT_SETTINGS: AppSettings = { chatCooldownSeconds: 20, blockedUsernames: [] };

/**
 * Configurações do site (ex: cooldown de pedidos no chat), guardadas numa
 * única linha da tabela "app_settings". Qualquer pessoa logada pode ler e
 * editar — não é restrito por papel/role, é "logado = pode mexer", como foi
 * pedido. Sincroniza em tempo real: se alguém mudar num navegador, todo
 * mundo com o site aberto vê a mudança na hora.
 */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("chat_cooldown_seconds, blocked_usernames")
      .eq("id", 1)
      .maybeSingle();

    if (!error && data) {
      setSettings({ chatCooldownSeconds: data.chat_cooldown_seconds, blockedUsernames: data.blocked_usernames ?? [] });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("app-settings-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => {
        void refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const updateCooldown = useCallback(async (seconds: number) => {
    const { error } = await supabase
      .from("app_settings")
      .update({ chat_cooldown_seconds: seconds, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (error) {
      console.error("[APP SETTINGS ERROR]", error.message, error);
      return false;
    }
    return true;
  }, []);

  const updateBlockedUsernames = useCallback(async (usernames: string[]) => {
    const cleaned = [...new Set(usernames.map((nick) => nick.trim().toLowerCase()).filter((nick) => /^[a-z0-9_-]{1,40}$/.test(nick)))];
    const { data, error } = await supabase
      .from("app_settings")
      .update({ blocked_usernames: cleaned, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("blocked_usernames")
      .single();
    if (error || !data) {
      console.error("[BLOCKED USERNAMES ERROR]", error?.message);
      return false;
    }
    setSettings((current) => ({ ...current, blockedUsernames: data.blocked_usernames }));
    return true;
  }, []);

  return { settings, loading, updateCooldown, updateBlockedUsernames };
}
