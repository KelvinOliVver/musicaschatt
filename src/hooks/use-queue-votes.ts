import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type VoteRecord = { item_id: string; voter_id: string };
export function useQueueVotes(queueIds: string[]) {
  const idsKey = queueIds.slice().sort().join(",");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<string[]>([]);
  const refresh = useCallback(async () => {
    const ids = idsKey.split(",").filter(Boolean);
    if (!ids.length) { setCounts({}); setMine([]); return; }
    const [{ data: auth }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("queue_votes").select("item_id,voter_id").in("item_id", ids).limit(10000),
    ]);
    if (error || !data) return;
    const votes = data as VoteRecord[];
    const next: Record<string, number> = {};
    for (const v of votes) next[v.item_id] = (next[v.item_id] ?? 0) + 1;
    setCounts(next);
    setMine(votes.filter((v) => v.voter_id === auth.user?.id).map((v) => v.item_id));
  }, [idsKey]);
  useEffect(() => {
    void refresh();
    const channel = supabase.channel("queue-votes-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_votes" }, () => { void refresh(); })
      .subscribe();
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => { clearInterval(timer); void supabase.removeChannel(channel); };
  }, [refresh]);
  const vote = useCallback(async (id: string) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { toast.error("Entre na conta para votar."); return; }
    const voted = mine.includes(id);
    const result = voted
      ? await supabase.from("queue_votes").delete().eq("item_id", id).eq("voter_id", auth.user.id)
      : await supabase.from("queue_votes").insert({ item_id: id, voter_id: auth.user.id });
    if (result.error) {
      toast.error("Não foi possível registrar o voto.");
      return;
    }
    void refresh();
  }, [mine, refresh]);
  return { counts, mine, vote, refresh };
}
