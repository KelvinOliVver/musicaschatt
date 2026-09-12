ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS channel_slug text;

UPDATE public.chat_messages
SET channel_slug = 'pitee4'
WHERE channel_slug IS NULL;

ALTER TABLE public.chat_messages
  ALTER COLUMN channel_slug SET NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_channel_created_at_idx
  ON public.chat_messages (channel_slug, created_at DESC);

DROP POLICY IF EXISTS "Authenticated users can read chat history" ON public.chat_messages;
DROP POLICY IF EXISTS "Authenticated users can store chat messages" ON public.chat_messages;

CREATE POLICY "Authenticated users can read chat history"
ON public.chat_messages FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can store chat messages"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (true);
