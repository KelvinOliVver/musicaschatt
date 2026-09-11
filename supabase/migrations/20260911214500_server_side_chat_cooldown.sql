-- Enforce chat song-request cooldown centrally in Postgres.
-- This prevents bypasses caused by multiple tabs, host changes, reconnects,
-- or page reloads. The cooldown is keyed by the Kick username.

CREATE TABLE IF NOT EXISTS public.chat_request_cooldowns (
  username_key text PRIMARY KEY,
  last_requested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_request_cooldowns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_request_cooldowns FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.chat_request_cooldowns TO service_role;

CREATE OR REPLACE FUNCTION public.claim_chat_request_cooldown(p_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  username_key text;
  cooldown_seconds integer;
  claimed boolean := false;
BEGIN
  username_key := lower(trim(COALESCE(p_username, '')));

  IF username_key = '' THEN
    RETURN false;
  END IF;

  SELECT GREATEST(COALESCE(chat_cooldown_seconds, 0), 0)
    INTO cooldown_seconds
  FROM public.app_settings
  WHERE id = 1;

  cooldown_seconds := COALESCE(cooldown_seconds, 20);

  IF cooldown_seconds = 0 THEN
    RETURN true;
  END IF;

  INSERT INTO public.chat_request_cooldowns (username_key, last_requested_at)
  VALUES (username_key, now())
  ON CONFLICT (username_key) DO UPDATE
  SET last_requested_at = now()
  WHERE public.chat_request_cooldowns.last_requested_at <=
        now() - make_interval(secs => cooldown_seconds)
  RETURNING true INTO claimed;

  RETURN COALESCE(claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_chat_request_cooldown(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_chat_request_cooldown(text) TO authenticated;
