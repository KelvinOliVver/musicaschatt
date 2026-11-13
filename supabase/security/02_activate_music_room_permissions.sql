-- STEP 2 (disruptive): apply ONLY after 01_prepare_music_room_admin.sql
-- has been applied and at least one CONFIRMED streamer auth.user UUID was
-- manually inserted into public.music_room_admins.
--
-- This is a manual Lovable Cloud SQL Editor activation script, NOT an
-- auto-applied migration. Frontend host authorization must be published in
-- the same controlled maintenance window.
--
-- Preflight BEFORE any privileges are altered.
DO $preflight$
BEGIN
  IF to_regclass('public.music_room_admins') IS NULL THEN
    RAISE EXCEPTION 'Prepare the admin table first (step 01)' USING ERRCODE='P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.music_room_admins a
    JOIN auth.users u ON u.id = a.user_id
  ) THEN
    RAISE EXCEPTION 'No verified streamer account assigned. Refusing to lock the live room.' USING ERRCODE='P0001';
  END IF;
END;
$preflight$;

BEGIN;

CREATE OR REPLACE FUNCTION public.is_music_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.music_room_admins a WHERE a.user_id = (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.is_music_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_music_admin() TO authenticated;

-- A server-side, expiring host lease: spectators cannot elect themselves;
-- multiple tabs of one admin account cannot process the same command twice.
CREATE TABLE IF NOT EXISTS public.music_room_host_lease (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  owner_auth_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.music_room_host_lease ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.music_room_host_lease FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.music_room_host_lease TO service_role;

CREATE OR REPLACE FUNCTION public.claim_music_room_host(p_client_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_client_id IS NULL OR NOT public.is_music_admin() THEN
    RETURN false;
  END IF;
  INSERT INTO public.music_room_host_lease (id, owner_auth_id, client_id, expires_at)
  VALUES (1, auth.uid(), p_client_id, now() + interval '25 seconds')
  ON CONFLICT (id) DO UPDATE
    SET owner_auth_id = EXCLUDED.owner_auth_id,
        client_id = EXCLUDED.client_id,
        expires_at = EXCLUDED.expires_at
    WHERE public.music_room_host_lease.expires_at < now()
       OR (
         public.music_room_host_lease.owner_auth_id = auth.uid()
         AND public.music_room_host_lease.client_id = p_client_id
       );
  RETURN FOUND;
END;
$$;
CREATE OR REPLACE FUNCTION public.release_music_room_host(p_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.music_room_host_lease
  WHERE id = 1 AND owner_auth_id = auth.uid() AND client_id = p_client_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_music_room_host(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_music_room_host(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_music_room_host(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_music_room_host(uuid) TO authenticated;

-- Deliberately discard all old blanket policies on these shared tables.
-- Read access is retained; write access now belongs only to room admins.
DO $policies$
DECLARE p record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['player_queue','chat_messages','app_settings']
  LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END;
$policies$;

ALTER TABLE public.player_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_queue TO authenticated;
CREATE POLICY music_queue_read ON public.player_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY music_queue_insert ON public.player_queue FOR INSERT TO authenticated
  WITH CHECK ((select public.is_music_admin()));
CREATE POLICY music_queue_update ON public.player_queue FOR UPDATE TO authenticated
  USING ((select public.is_music_admin()))
  WITH CHECK ((select public.is_music_admin()));
CREATE POLICY music_queue_delete ON public.player_queue FOR DELETE TO authenticated
  USING ((select public.is_music_admin()));

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chat_messages TO anon, authenticated;
GRANT INSERT ON public.chat_messages TO authenticated;
CREATE POLICY music_chat_read ON public.chat_messages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY music_chat_insert ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK ((select public.is_music_admin()));

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
CREATE POLICY music_settings_read ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY music_settings_update ON public.app_settings FOR UPDATE TO authenticated
  USING ((select public.is_music_admin()))
  WITH CHECK ((select public.is_music_admin()));

CREATE INDEX IF NOT EXISTS player_queue_played_recent_idx
ON public.player_queue (played_at DESC) WHERE status = 'played';

-- The authenticated role may invoke these functions, but their bodies MUST
-- check is_music_admin(). SECURITY DEFINER bypasses table RLS.

CREATE OR REPLACE FUNCTION public.play_queue_item(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Protect SECURITY DEFINER RPCs: RLS is bypassed inside them.
  IF NOT public.is_music_admin() THEN
    RAISE EXCEPTION 'music_room_admin_required' USING ERRCODE = '42501';
  END IF;
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


CREATE OR REPLACE FUNCTION public.play_previous_queue_item()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  previous_id uuid;
  current_id uuid;
  current_priority boolean;
  top_position double precision;
BEGIN
  -- Protect SECURITY DEFINER RPCs: RLS is bypassed inside them.
  IF NOT public.is_music_admin() THEN
    RAISE EXCEPTION 'music_room_admin_required' USING ERRCODE = '42501';
  END IF;
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


CREATE OR REPLACE FUNCTION public.advance_player_queue()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  next_id uuid;
BEGIN
  -- Protect SECURITY DEFINER RPCs: RLS is bypassed inside them.
  IF NOT public.is_music_admin() THEN
    RAISE EXCEPTION 'music_room_admin_required' USING ERRCODE = '42501';
  END IF;
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


REVOKE ALL ON FUNCTION public.play_queue_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_player_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.play_previous_queue_item() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.play_queue_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_player_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_previous_queue_item() TO authenticated;

COMMIT;

-- Suggested verification (run separately in SQL editor):
-- SELECT user_id FROM public.music_room_admins;
-- SELECT policyname, cmd FROM pg_policies WHERE tablename IN
--   ('player_queue', 'chat_messages', 'app_settings');
-- SELECT has_function_privilege('anon', 'public.advance_player_queue()', 'execute');
-- Confirm anon=false, ordinary authenticated roles denied by RLS,
-- and the designated admin can add/skip/clear with a real JWT.
