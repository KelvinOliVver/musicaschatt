-- When the queue is empty, do not replay old songs automatically.
-- The player should show its intentional empty/waiting state instead.

CREATE OR REPLACE FUNCTION public.advance_player_queue()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('player_queue_transition'));

  SELECT id
    INTO next_id
  FROM public.player_queue
  WHERE status = 'queued'
  ORDER BY priority DESC, position ASC, id ASC
  LIMIT 1;

  -- No queued track: finish the current track and leave the player empty.
  IF next_id IS NULL THEN
    UPDATE public.player_queue
    SET status = 'played',
        played_at = COALESCE(played_at, now())
    WHERE status = 'playing';
    RETURN NULL;
  END IF;

  UPDATE public.player_queue
  SET status = 'played',
      played_at = COALESCE(played_at, now())
  WHERE status = 'playing';

  UPDATE public.player_queue
  SET status = 'playing',
      played_at = NULL,
      playback_position = 0,
      is_paused = false,
      state_updated_at = now(),
      duration_seconds = NULL
  WHERE id = next_id
    AND status = 'queued';

  RETURN next_id;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_player_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_player_queue() TO authenticated;
