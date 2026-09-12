-- When the queue is empty, keep the room alive with an automatic radio pick.
-- Prefer a track that is not among the last few played, so the ending does
-- not immediately loop the same songs over and over.

CREATE OR REPLACE FUNCTION public.advance_player_queue()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_id uuid;
  current_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('player_queue_transition'));

  SELECT id
    INTO current_id
  FROM public.player_queue
  WHERE status = 'playing'
  ORDER BY state_updated_at DESC NULLS LAST, added_at DESC
  LIMIT 1;

  -- Normal queue: always respect requested order and VIP priority.
  SELECT id
    INTO next_id
  FROM public.player_queue
  WHERE status = 'queued'
  ORDER BY priority DESC, position ASC, id ASC
  LIMIT 1;

  -- Empty queue: automatic radio mode.
  -- First try something outside the most recent 5 played tracks.
  IF next_id IS NULL THEN
    SELECT candidate.id
      INTO next_id
    FROM public.player_queue AS candidate
    WHERE candidate.status = 'played'
      AND candidate.id IS DISTINCT FROM current_id
      AND candidate.id NOT IN (
        SELECT recent.id
        FROM public.player_queue AS recent
        WHERE recent.status = 'played'
        ORDER BY recent.played_at DESC NULLS LAST,
                 recent.state_updated_at DESC NULLS LAST,
                 recent.added_at DESC
        LIMIT 5
      )
    ORDER BY random()
    LIMIT 1;

    -- If the history is small, at least avoid replaying the exact same track.
    IF next_id IS NULL THEN
      SELECT candidate.id
        INTO next_id
      FROM public.player_queue AS candidate
      WHERE candidate.status = 'played'
        AND candidate.id IS DISTINCT FROM current_id
      ORDER BY random()
      LIMIT 1;
    END IF;
  END IF;

  -- Nothing else exists: stop normally.
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
    AND status IN ('queued', 'played');

  RETURN next_id;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_player_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_player_queue() TO authenticated;
