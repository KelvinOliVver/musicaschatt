
CREATE TABLE IF NOT EXISTS public.streamer_rooms (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9_-]{1,40}$'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.streamer_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Room directory for signed in users" ON public.streamer_rooms;
CREATE POLICY "Room directory for signed in users" ON public.streamer_rooms FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.streamer_rooms FROM anon;
GRANT SELECT ON public.streamer_rooms TO authenticated;
INSERT INTO public.streamer_rooms(slug) VALUES ('roceiraplay') ON CONFLICT DO NOTHING;

ALTER TABLE public.player_queue ADD COLUMN IF NOT EXISTS room_slug text NOT NULL DEFAULT 'roceiraplay';
ALTER TABLE public.player_queue ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='player_queue_approval_check') THEN
  ALTER TABLE public.player_queue ADD CONSTRAINT player_queue_approval_check
   CHECK (approval_status IN ('approved','pending','rejected'));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS player_queue_room_status_idx ON public.player_queue(room_slug,status,priority DESC,position);
DROP INDEX IF EXISTS public.player_queue_single_playing;
CREATE UNIQUE INDEX IF NOT EXISTS player_queue_one_playing_per_room ON public.player_queue(room_slug) WHERE status='playing';
DROP INDEX IF EXISTS public.player_queue_strict_queued_idx;
CREATE UNIQUE INDEX IF NOT EXISTS player_queue_unique_queued_in_room ON public.player_queue(room_slug,track_id)
 WHERE status='queued' AND approval_status <> 'rejected';

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS room_slug text NOT NULL DEFAULT 'roceiraplay';
CREATE UNIQUE INDEX IF NOT EXISTS app_settings_room_slug_idx ON public.app_settings(room_slug);
CREATE SEQUENCE IF NOT EXISTS public.app_settings_room_id_seq AS smallint START WITH 2;
ALTER TABLE public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_room_id_seq');
REVOKE ALL ON public.app_settings_room_id_seq FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_streamer_room(p_slug text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE clean_slug text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login necessário'; END IF;
 clean_slug := lower(trim(p_slug));
 IF clean_slug !~ '^[a-z0-9_-]{1,40}$' THEN RAISE EXCEPTION 'Nome de canal inválido'; END IF;
 INSERT INTO public.streamer_rooms(slug,created_by) VALUES (clean_slug,auth.uid()) ON CONFLICT DO NOTHING;
 INSERT INTO public.app_settings(room_slug) VALUES (clean_slug) ON CONFLICT (room_slug) DO NOTHING;
 RETURN clean_slug;
END $$;
REVOKE ALL ON FUNCTION public.create_streamer_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_streamer_room(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.room_play_item(p_id uuid,p_room_slug text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_room text := lower(trim(p_room_slug));
BEGIN
 IF auth.uid() IS NULL OR v_room !~ '^[a-z0-9_-]{1,40}$' THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('player_room_' || v_room));
 IF NOT EXISTS (SELECT 1 FROM public.player_queue WHERE id=p_id AND room_slug=v_room
   AND approval_status='approved' AND status IN ('queued','played')) THEN RETURN false; END IF;
 UPDATE public.player_queue SET status='played',played_at=coalesce(played_at,now())
   WHERE room_slug=v_room AND status='playing' AND id<>p_id;
 UPDATE public.player_queue SET status='playing',played_at=NULL,playback_position=0,
   is_paused=false,state_updated_at=now(),duration_seconds=NULL
   WHERE id=p_id AND room_slug=v_room AND approval_status='approved' AND status IN ('queued','played');
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.room_play_item(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.room_play_item(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.room_next_item(p_room_slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_room text := lower(trim(p_room_slug)); v_next uuid;
BEGIN
 IF auth.uid() IS NULL OR v_room !~ '^[a-z0-9_-]{1,40}$' THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('player_room_' || v_room));
 SELECT id INTO v_next FROM public.player_queue
  WHERE room_slug=v_room AND status='queued' AND approval_status='approved'
  ORDER BY priority DESC,position ASC,id ASC LIMIT 1;
 UPDATE public.player_queue SET status='played',played_at=now()
  WHERE room_slug=v_room AND status='playing';
 IF v_next IS NOT NULL THEN
  UPDATE public.player_queue SET status='playing',played_at=NULL,playback_position=0,
    is_paused=false,state_updated_at=now(),duration_seconds=NULL WHERE id=v_next;
 END IF;
 RETURN v_next;
END $$;
REVOKE ALL ON FUNCTION public.room_next_item(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.room_next_item(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.room_previous_item(p_room_slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_room text := lower(trim(p_room_slug)); v_prev uuid; v_current record; v_top double precision;
BEGIN
 IF auth.uid() IS NULL OR v_room !~ '^[a-z0-9_-]{1,40}$' THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('player_room_' || v_room));
 SELECT id INTO v_prev FROM public.player_queue WHERE room_slug=v_room AND status='played'
    AND approval_status='approved'
    ORDER BY played_at DESC NULLS LAST,added_at DESC,id DESC LIMIT 1;
 IF v_prev IS NULL THEN RETURN NULL; END IF;
 SELECT id,priority INTO v_current FROM public.player_queue WHERE room_slug=v_room AND status='playing' LIMIT 1;
 IF v_current.id IS NOT NULL THEN
  SELECT coalesce(min(position),0)-1000 INTO v_top FROM public.player_queue
   WHERE room_slug=v_room AND status='queued' AND priority=v_current.priority;
  UPDATE public.player_queue SET status='queued',played_at=NULL,position=v_top,state_updated_at=now()
    WHERE id=v_current.id;
 END IF;
 UPDATE public.player_queue SET status='playing',played_at=NULL,playback_position=0,
   is_paused=false,state_updated_at=now(),duration_seconds=NULL WHERE id=v_prev;
 RETURN v_prev;
END $$;
REVOKE ALL ON FUNCTION public.room_previous_item(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.room_previous_item(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_obs_player_state(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
DECLARE result jsonb;
BEGIN
 IF p_token IS NULL OR length(p_token)<>36 THEN RETURN NULL; END IF;
 SELECT jsonb_build_object(
  'id',p.id,'source',p.source,'track_id',p.track_id,'url',p.url,'title',p.title,
  'author',p.author,'thumbnail',p.thumbnail,'requested_by',p.requested_by,
  'playback_position',coalesce(p.playback_position,0),'is_paused',coalesce(p.is_paused,false),
  'state_updated_at',p.state_updated_at,'duration_seconds',p.duration_seconds,
  'volume',s.obs_volume,'muted',s.obs_muted,
  'next_title',n.title,'next_requested_by',n.requested_by,'next_source',n.source,
  'room_slug',s.room_slug
 ) INTO result
 FROM public.app_settings s
 LEFT JOIN LATERAL (
  SELECT id,source,track_id,url,title,author,thumbnail,requested_by,playback_position,
   is_paused,state_updated_at,duration_seconds
  FROM public.player_queue
  WHERE room_slug=s.room_slug AND status='playing'
  ORDER BY state_updated_at DESC NULLS LAST LIMIT 1
 ) p ON true
 LEFT JOIN LATERAL (
  SELECT title,requested_by,source FROM public.player_queue
  WHERE room_slug=s.room_slug AND status='queued' AND approval_status='approved'
  ORDER BY priority DESC,position ASC LIMIT 1
 ) n ON true
 WHERE s.obs_token::text=p_token;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_obs_player_state(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_obs_player_state(text) TO anon,authenticated;
