-- Fix Previous navigation so the track being left is returned to the queue.
-- This is intentionally a NEW migration because older migrations may already
-- have been applied to the production database.

CREATE OR REPLACE FUNCTION public.play_previous_queue_item()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_id uuid;
  current_id uuid;
  current_priority boolean;
  top_position double precision;
BEGIN
  -- Only one client/tab can perform a player transition at a time.
  PERFORM pg_advisory_xact_lock(hashtext('player_queue_transition'));

  -- Find the actual current track.
  SELECT id, priority
    INTO current_id, current_priority
  FROM public.player_queue
  WHERE status = 'playing'
  ORDER BY state_updated_at DESC NULLS LAST, added_at DESC, id DESC
  LIMIT 1;

  -- The previous track is the most recently completed track.
  SELECT id
    INTO previous_id
  FROM public.player_queue
  WHERE status = 'played'
  ORDER BY played_at DESC NULLS LAST,
           state_updated_at DESC NULLS LAST,
           added_at DESC,
           id DESC
  LIMIT 1;

  IF previous_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- IMPORTANT: Previous is navigation, not deletion from the queue history.
  -- Put the track we are leaving back at the FRONT of its priority queue.
  IF current_id IS NOT NULL THEN
    SELECT COALESCE(MIN(position), 0) - 1000
      INTO top_position
    FROM public.player_queue
    WHERE status = 'queued'
      AND priority = current_priority;

    UPDATE public.player_queue
    SET status = 'queued',
        played_at = NULL,
        position = top_position,
        state_updated_at = now()
    WHERE id = current_id
      AND status = 'playing';
  END IF;

  -- Start the previous track from the beginning.
  UPDATE public.player_queue
  SET status = 'playing',
      played_at = NULL,
      playback_position = 0,
      is_paused = false,
      state_updated_at = now(),
      duration_seconds = NULL
  WHERE id = previous_id
    AND status = 'played';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN previous_id;
END;
$$;

REVOKE ALL ON FUNCTION public.play_previous_queue_item() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_previous_queue_item() TO authenticated;
