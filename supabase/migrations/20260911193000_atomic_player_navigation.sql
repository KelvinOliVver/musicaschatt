-- Make Next/Previous atomic at the database level.
-- This is the single source of truth for navigation when multiple listeners
-- are connected at the same time.

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

  IF next_id IS NULL THEN
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
  PERFORM pg_advisory_xact_lock(hashtext('player_queue_transition'));

  SELECT id, priority
    INTO current_id, current_priority
  FROM public.player_queue
  WHERE status = 'playing'
  ORDER BY state_updated_at DESC NULLS LAST, added_at DESC
  LIMIT 1;

  SELECT id
    INTO previous_id
  FROM public.player_queue
  WHERE status = 'played'
  ORDER BY played_at DESC NULLS LAST, state_updated_at DESC NULLS LAST, added_at DESC
  LIMIT 1;

  IF previous_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF current_id IS NOT NULL THEN
    SELECT COALESCE(MIN(position), 0) - 1000
      INTO top_position
    FROM public.player_queue
    WHERE status = 'queued'
      AND priority = current_priority;

    UPDATE public.player_queue
    SET status = 'queued',
        played_at = NULL,
        position = top_position
    WHERE id = current_id;
  END IF;

  UPDATE public.player_queue
  SET status = 'playing',
      played_at = NULL,
      playback_position = 0,
      is_paused = false,
      state_updated_at = now(),
      duration_seconds = NULL
  WHERE id = previous_id
    AND status = 'played';

  RETURN previous_id;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_player_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.play_previous_queue_item() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_player_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_previous_queue_item() TO authenticated;
