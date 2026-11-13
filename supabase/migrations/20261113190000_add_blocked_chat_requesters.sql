-- Persist Kick usernames whose video requests must be ignored.
-- Reuse app_settings policies: authenticated users may read, administrators update.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS blocked_usernames text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.app_settings.blocked_usernames IS
  'Normalized lowercase Kick usernames blocked from submitting links to the shared player queue.';
