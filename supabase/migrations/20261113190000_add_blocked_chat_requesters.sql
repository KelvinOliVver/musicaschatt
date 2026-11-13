-- Persist Kick usernames whose video requests must be ignored.
-- Reuse app_settings policies: authenticated users may read, administrators update.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS blocked_usernames text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.app_settings.blocked_usernames IS
  'Normalized lowercase Kick usernames blocked from submitting links to the shared player queue.';

-- Allow the elected playback host to receive blocklist changes immediately.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'app_settings'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
  END IF;
END $$;
