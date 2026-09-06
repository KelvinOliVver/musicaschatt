-- keep only the most recently updated "playing" row
UPDATE public.player_queue p
SET status = 'played', played_at = COALESCE(played_at, now())
WHERE status = 'playing'
  AND id <> (
    SELECT id FROM public.player_queue
    WHERE status = 'playing'
    ORDER BY state_updated_at DESC NULLS LAST, added_at DESC
    LIMIT 1
  );

-- enforce a single playing track from now on
CREATE UNIQUE INDEX IF NOT EXISTS player_queue_single_playing
  ON public.player_queue ((status)) WHERE status = 'playing';