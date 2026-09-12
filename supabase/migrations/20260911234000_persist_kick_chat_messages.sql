CREATE TABLE IF NOT EXISTS public.chat_messages (
  id text PRIMARY KEY,
  username text NOT NULL,
  color text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'command'))
);

CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx
  ON public.chat_messages (created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

CREATE POLICY "Authenticated users can read chat history"
ON public.chat_messages FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can store chat messages"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (true);

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
