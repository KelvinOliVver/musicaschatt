-- Make chat persistence self-contained and safe even if the first migration
-- was not applied cleanly in Lovable Cloud.
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id text PRIMARY KEY,
  username text NOT NULL,
  color text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'command')),
  channel_slug text
);

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS channel_slug text;

UPDATE public.chat_messages
SET channel_slug = 'pitee4'
WHERE channel_slug IS NULL;

ALTER TABLE public.chat_messages
  ALTER COLUMN channel_slug SET DEFAULT 'pitee4';

ALTER TABLE public.chat_messages
  ALTER COLUMN channel_slug SET NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx
  ON public.chat_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_channel_created_at_idx
  ON public.chat_messages (channel_slug, created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.chat_messages TO anon, authenticated;
GRANT ALL ON public.chat_messages TO service_role;

DROP POLICY IF EXISTS "Authenticated users can read chat history" ON public.chat_messages;
DROP POLICY IF EXISTS "Authenticated users can store chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Public users can read chat history" ON public.chat_messages;
DROP POLICY IF EXISTS "Public users can store chat messages" ON public.chat_messages;

CREATE POLICY "Public users can read chat history"
ON public.chat_messages FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Public users can store chat messages"
ON public.chat_messages FOR INSERT TO anon, authenticated
WITH CHECK (true);
