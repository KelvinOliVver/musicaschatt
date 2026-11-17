-- Extend only RoceiraFX settings. Existing effects, auth grants and OBS token stay unchanged.
BEGIN;
ALTER TABLE public.fx_effects DROP CONSTRAINT IF EXISTS fx_effects_display_seconds_check;
ALTER TABLE public.fx_effects ADD CONSTRAINT fx_effects_display_seconds_check
  CHECK (display_seconds BETWEEN 1 AND 1800);

ALTER TABLE public.fx_effects DROP CONSTRAINT IF EXISTS fx_effects_size_check;
ALTER TABLE public.fx_effects ADD CONSTRAINT fx_effects_size_check
  CHECK (size IN ('small', 'medium', 'large', 'extra-large', 'fullscreen'));

-- The OBS overlay needs to be able to resume effects running for up to 30 minutes.
CREATE OR REPLACE FUNCTION public.fx_overlay_poll(p_key text,p_after bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE valid boolean; latest bigint; data jsonb;
BEGIN
 IF p_key IS NULL OR p_key !~ '^[0-9a-fA-F-]{36}$' THEN RETURN NULL; END IF;
 SELECT EXISTS(SELECT 1 FROM public.fx_settings WHERE overlay_token::text=p_key) INTO valid;
 IF NOT valid THEN RETURN NULL; END IF;
 SELECT COALESCE(max(id),0) INTO latest FROM public.fx_events;
 IF p_after IS NULL THEN RETURN jsonb_build_object('latest',latest,'events','[]'::jsonb); END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'command',command,'payload',payload,'createdAt',created_at) ORDER BY id),'[]'::jsonb)
 INTO data FROM (
   SELECT id,command,payload,created_at FROM public.fx_events
   WHERE id>p_after AND created_at>now()-interval '31 minutes'
   ORDER BY id ASC LIMIT 30
 ) ev;
 RETURN jsonb_build_object('latest',latest,'events',data);
END $$;
COMMIT;
