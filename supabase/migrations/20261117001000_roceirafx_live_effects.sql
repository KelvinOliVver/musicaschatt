-- RoceiraFX: isolated effects studio inside music.chat.
-- Does not change the existing music queue/chat/OBS functions.
-- Signed-in music.chat administrators and a single invited second account can manage FX.
-- The public Browser Source can only read recent effects with a revocable random token.

CREATE TABLE IF NOT EXISTS public.fx_owner(
  id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fx_owner ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fx_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.fx_owner WHERE user_id = (SELECT auth.uid())
  )
$;
REVOKE ALL ON FUNCTION public.fx_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.fx_claim_owner()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin')
 THEN RAISE EXCEPTION 'Somente o administrador original do music.chat pode ativar o RoceiraFX'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('musicchat_fx_owner'));
 INSERT INTO public.fx_owner(id,user_id) VALUES (1,auth.uid()) ON CONFLICT(id) DO NOTHING;
 RETURN EXISTS(SELECT 1 FROM public.fx_owner WHERE user_id=auth.uid());
END $;
REVOKE ALL ON FUNCTION public.fx_claim_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_claim_owner() TO authenticated;

CREATE TABLE IF NOT EXISTS public.fx_members(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fx_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fx_is_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND
    (public.fx_is_admin() OR EXISTS (
      SELECT 1 FROM public.fx_members WHERE user_id = (SELECT auth.uid())
    ))
$$;
REVOKE ALL ON FUNCTION public.fx_is_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_is_allowed() TO authenticated;

DROP POLICY IF EXISTS "fx members read" ON public.fx_members;
CREATE POLICY "fx members read" ON public.fx_members FOR SELECT TO authenticated
USING (public.fx_is_allowed());
GRANT SELECT ON public.fx_members TO authenticated;

CREATE OR REPLACE FUNCTION public.fx_set_member(p_email text, p_enabled boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_id uuid; clean_email text;
BEGIN
  IF NOT public.fx_is_admin() THEN RAISE EXCEPTION 'Acesso restrito ao administrador'; END IF;
  clean_email := lower(trim(p_email));
  IF clean_email !~ '^[^ @]+@[^ @]+[.][^ @]+$' OR length(clean_email)>254 THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;
  SELECT id INTO new_id FROM auth.users WHERE lower(email) = clean_email LIMIT 1;
  IF new_id IS NULL THEN RAISE EXCEPTION 'A Roceira precisa criar uma conta no music.chat antes de receber acesso'; END IF;
  IF EXISTS(SELECT 1 FROM public.fx_owner WHERE user_id = new_id) THEN
    RAISE EXCEPTION 'Esta conta já é administradora';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('musicchat_fx_one_member'));
  IF p_enabled THEN
    IF (SELECT count(*) FROM public.fx_members WHERE user_id <> new_id) > 0 THEN
      RAISE EXCEPTION 'Só é permitido um membro extra. Remova o anterior primeiro';
    END IF;
    INSERT INTO public.fx_members(user_id) VALUES(new_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.fx_members WHERE user_id = new_id;
  END IF;
  RETURN CASE WHEN p_enabled THEN 'Convidado autorizado' ELSE 'Acesso revogado' END;
END $$;
REVOKE ALL ON FUNCTION public.fx_set_member(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_set_member(text,boolean) TO authenticated;

CREATE TABLE IF NOT EXISTS public.fx_effects(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
  media_type text NOT NULL CHECK (media_type IN ('audio','image','gif','video')),
  media_path text,
  external_url text,
  volume integer NOT NULL DEFAULT 80 CHECK (volume BETWEEN 0 AND 100),
  display_seconds integer NOT NULL DEFAULT 5 CHECK (display_seconds BETWEEN 1 AND 30),
  position text NOT NULL DEFAULT 'center' CHECK(position IN ('top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right')),
  size text NOT NULL DEFAULT 'medium' CHECK(size IN ('small','medium','large')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((media_path IS NOT NULL AND external_url IS NULL) OR
         (media_path IS NULL AND external_url ~ '^https://'))
);
ALTER TABLE public.fx_effects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fx read" ON public.fx_effects;
CREATE POLICY "fx read" ON public.fx_effects FOR SELECT TO authenticated USING (public.fx_is_allowed());
DROP POLICY IF EXISTS "fx insert" ON public.fx_effects;
CREATE POLICY "fx insert" ON public.fx_effects FOR INSERT TO authenticated WITH CHECK
(public.fx_is_allowed() AND created_by=(SELECT auth.uid()));
DROP POLICY IF EXISTS "fx update" ON public.fx_effects;
CREATE POLICY "fx update" ON public.fx_effects FOR UPDATE TO authenticated USING(public.fx_is_allowed()) WITH CHECK(public.fx_is_allowed());
DROP POLICY IF EXISTS "fx delete" ON public.fx_effects;
CREATE POLICY "fx delete" ON public.fx_effects FOR DELETE TO authenticated USING(public.fx_is_allowed());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.fx_effects TO authenticated;

CREATE TABLE IF NOT EXISTS public.fx_settings(
 id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
 overlay_token uuid NOT NULL DEFAULT gen_random_uuid(),
 master_volume integer NOT NULL DEFAULT 80 CHECK (master_volume BETWEEN 0 AND 100),
 cooldown_ms integer NOT NULL DEFAULT 750 CHECK (cooldown_ms BETWEEN 0 AND 15000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fx_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.fx_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
DROP POLICY IF EXISTS "fx settings read" ON public.fx_settings;
CREATE POLICY "fx settings read" ON public.fx_settings FOR SELECT TO authenticated USING(public.fx_is_allowed());
DROP POLICY IF EXISTS "fx settings update" ON public.fx_settings;
CREATE POLICY "fx settings update" ON public.fx_settings FOR UPDATE TO authenticated USING(public.fx_is_admin()) WITH CHECK(public.fx_is_admin());
GRANT SELECT,UPDATE ON public.fx_settings TO authenticated;

CREATE TABLE IF NOT EXISTS public.fx_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 command text NOT NULL CHECK(command IN ('PLAY','STOP_ALL','TEST')),
 effect_id uuid REFERENCES public.fx_effects(id) ON DELETE SET NULL,
 payload jsonb,
 triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fx_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fx history read" ON public.fx_events;
CREATE POLICY "fx history read" ON public.fx_events FOR SELECT TO authenticated USING(public.fx_is_allowed());
GRANT SELECT ON public.fx_events TO authenticated;

CREATE OR REPLACE FUNCTION public.fx_fire(p_effect_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE item public.fx_effects; cfg public.fx_settings; last_time timestamptz; event_id bigint;
BEGIN
 IF NOT public.fx_is_allowed() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT * INTO item FROM public.fx_effects WHERE id=p_effect_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Efeito não encontrado'; END IF;
 SELECT * INTO cfg FROM public.fx_settings WHERE id=1 FOR UPDATE;
 SELECT max(created_at) INTO last_time FROM public.fx_events WHERE command='PLAY';
 IF last_time IS NOT NULL AND now()-last_time < cfg.cooldown_ms * INTERVAL '1 millisecond' THEN
  RAISE EXCEPTION 'Cooldown ativo';
 END IF;
 INSERT INTO public.fx_events(command,effect_id,payload,triggered_by)
 VALUES('PLAY',item.id,jsonb_build_object(
  'title',item.title,'mediaType',item.media_type,'mediaPath',item.media_path,
  'externalUrl',item.external_url,'volume',item.volume,'masterVolume',cfg.master_volume,
  'seconds',item.display_seconds,'position',item.position,'size',item.size
 ),auth.uid()) RETURNING id INTO event_id;
 RETURN event_id;
END $$;
REVOKE ALL ON FUNCTION public.fx_fire(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_fire(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fx_command(p_command text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE event_id bigint;
BEGIN
 IF NOT public.fx_is_allowed() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF p_command NOT IN ('STOP_ALL','TEST') THEN RAISE EXCEPTION 'Comando inválido'; END IF;
 INSERT INTO public.fx_events(command,triggered_by) VALUES (p_command,auth.uid())
 RETURNING id INTO event_id;
 RETURN event_id;
END $$;
REVOKE ALL ON FUNCTION public.fx_command(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_command(text) TO authenticated;

-- The token never permits mutation. A new overlay begins at the current event ID
-- so refreshing OBS does not replay old media.
CREATE OR REPLACE FUNCTION public.fx_overlay_poll(p_key text,p_after bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE valid boolean; latest bigint; data jsonb;
BEGIN
 IF p_key IS NULL OR p_key !~ '^[0-9a-fA-F-]{36}$' THEN RETURN NULL; END IF;
 SELECT EXISTS(SELECT 1 FROM public.fx_settings WHERE overlay_token::text=p_key) INTO valid;
 IF NOT valid THEN RETURN NULL; END IF;
 SELECT COALESCE(max(id),0) INTO latest FROM public.fx_events;
 IF p_after IS NULL THEN
  RETURN jsonb_build_object('latest',latest,'events','[]'::jsonb);
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'command',command,'payload',payload,'createdAt',created_at) ORDER BY id),'[]'::jsonb)
 INTO data FROM (SELECT id,command,payload,created_at FROM public.fx_events
   WHERE id>p_after AND created_at>now()-interval '2 minutes' ORDER BY id ASC LIMIT 30) ev;
 RETURN jsonb_build_object('latest',latest,'events',data);
END $$;
REVOKE ALL ON FUNCTION public.fx_overlay_poll(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_overlay_poll(text,bigint) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.fx_rotate_token()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE generated text;
BEGIN
 IF NOT public.fx_is_admin() THEN RAISE EXCEPTION 'Apenas administrador'; END IF;
 UPDATE public.fx_settings SET overlay_token=gen_random_uuid(),updated_at=now()
 WHERE id=1 RETURNING overlay_token::text INTO generated;
 RETURN generated;
END $$;
REVOKE ALL ON FUNCTION public.fx_rotate_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_rotate_token() TO authenticated;

-- Public read is necessary to play files in an unauthenticated OBS Browser Source.
-- Asset URLs are shareable; only admin/member may upload/edit files.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('fx-media','fx-media',true,52428800,ARRAY[
  'audio/mpeg','audio/wav','audio/ogg','image/png','image/jpeg','image/webp',
  'image/gif','video/mp4','video/webm'
 ]) ON CONFLICT(id) DO NOTHING;
DROP POLICY IF EXISTS "fx storage upload" ON storage.objects;
CREATE POLICY "fx storage upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='fx-media' AND public.fx_is_allowed() AND
 split_part(name,'/',1)=(SELECT auth.uid())::text);
DROP POLICY IF EXISTS "fx storage removal" ON storage.objects;
CREATE POLICY "fx storage removal" ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='fx-media' AND public.fx_is_allowed());
DROP POLICY IF EXISTS "fx storage listing" ON storage.objects;
CREATE POLICY "fx storage listing" ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='fx-media' AND public.fx_is_allowed());
