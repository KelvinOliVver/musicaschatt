-- Enforce the Kick chat song-request cooldown in Postgres so it cannot be
-- bypassed by multiple tabs, host changes, reconnects, or page reloads.
-- Manual/VIP requests use priority=true and are intentionally excluded.

CREATE TABLE IF NOT EXISTS public.chat_request_cooldowns (
  username_key text PRIMARY KEY,
  last_requested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_request_cooldowns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_request_cooldowns FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.chat_request_cooldowns TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_chat_request_cooldown()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  username_key text;
  cooldown_seconds integer;
  claimed boolean := false;
BEGIN
  -- Manual additions from the site are not Kick chat requests.
  IF NEW.priority = true OR lower(trim(COALESCE(NEW.requested_by, ''))) = 'você' THEN
    RETURN NEW;
  END IF;

  username_key := lower(trim(COALESCE(NEW.requested_by, '')));
  IF username_key = '' THEN
    RETURN NEW;
  END IF;

  SELECT GREATEST(COALESCE(chat_cooldown_seconds, 0), 0)
    INTO cooldown_seconds
  FROM public.app_settings
  WHERE id = 1;

  -- Keep the existing site's fallback when settings are unavailable.
  cooldown_seconds := COALESCE(cooldown_seconds, 20);

  IF cooldown_seconds = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.chat_request_cooldowns (username_key, last_requested_at)
  VALUES (username_key, now())
  ON CONFLICT (username_key) DO UPDATE
  SET last_requested_at = now()
  WHERE public.chat_request_cooldowns.last_requested_at <=
        now() - make_interval(secs => cooldown_seconds)
  RETURNING true INTO claimed;

  IF NOT COALESCE(claimed, false) THEN
    RAISE EXCEPTION 'chat_request_cooldown:%', cooldown_seconds
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_chat_request_cooldown_on_insert
  ON public.player_queue;

CREATE TRIGGER enforce_chat_request_cooldown_on_insert
  BEFORE INSERT ON public.player_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_chat_request_cooldown();

REVOKE ALL ON FUNCTION public.enforce_chat_request_cooldown() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_chat_request_cooldown() TO authenticated;
