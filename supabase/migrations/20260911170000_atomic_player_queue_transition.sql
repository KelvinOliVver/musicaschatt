-- Serialize queue transitions so concurrent tabs cannot race while changing
-- the single `playing` row protected by player_queue_single_playing.
CREATE OR REPLACE FUNCTION public.play_queue_item(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- One lock for the shared player state. It is held only for this transaction.
  PERFORM pg_advisory_xact_lock(hashtext('player_queue_transition'));

  -- Stop the current track first, then start the requested item in the same
  -- transaction. This makes the partial unique index safe across tabs.
  UPDATE public.player_queue
  SET status = 'played',
      played_at = COALESCE(played_at, now())
  WHERE status = 'playing'
    AND id <> p_id;

  UPDATE public.player_queue
  SET status = 'playing',
      played_at = NULL,
      playback_position = 0,
      is_paused = false,
      state_updated_at = now(),
      duration_seconds = NULL
  WHERE id = p_id
    AND status IN ('queued', 'played');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.play_queue_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_queue_item(uuid) TO authenticated;
