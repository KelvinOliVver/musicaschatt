-- Shared streamer settings, read-only tokenized OBS source, and per-account votes.
-- The token grants READ ONLY access to the currently playing item's public media metadata.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS streamer_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS obs_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS obs_volume smallint NOT NULL DEFAULT 70;
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS obs_muted boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.queue_votes (
  item_id uuid NOT NULL REFERENCES public.player_queue(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, voter_id)
);
ALTER TABLE public.queue_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in viewers can read queue votes" ON public.queue_votes;
CREATE POLICY "Signed-in viewers can read queue votes" ON public.queue_votes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Signed-in viewers can vote" ON public.queue_votes;
CREATE POLICY "Signed-in viewers can vote" ON public.queue_votes
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = voter_id);
DROP POLICY IF EXISTS "Signed-in viewers can remove own vote" ON public.queue_votes;
CREATE POLICY "Signed-in viewers can remove own vote" ON public.queue_votes
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = voter_id);
GRANT SELECT, INSERT, DELETE ON public.queue_votes TO authenticated;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'queue_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_votes;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_obs_player_state(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE output jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 36 THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'id', p.id, 'source', p.source, 'track_id', p.track_id, 'url', p.url,
    'title', p.title, 'author', p.author, 'thumbnail', p.thumbnail,
    'playback_position', coalesce(p.playback_position, 0),
    'is_paused', coalesce(p.is_paused, false),
    'state_updated_at', p.state_updated_at, 'duration_seconds', p.duration_seconds,
    'volume', s.obs_volume, 'muted', s.obs_muted
  ) INTO output
  FROM public.app_settings AS s
  LEFT JOIN LATERAL (
    SELECT id, source, track_id, url, title, author, thumbnail,
      playback_position, is_paused, state_updated_at, duration_seconds
    FROM public.player_queue
    WHERE status = 'playing'
    ORDER BY state_updated_at DESC NULLS LAST, added_at DESC
    LIMIT 1
  ) AS p ON TRUE
  WHERE s.id = 1 AND s.obs_token::text = p_token;
  RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.get_obs_player_state(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_obs_player_state(text) TO anon, authenticated;
