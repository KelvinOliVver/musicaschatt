CREATE TABLE public.player_queue (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'youtube',
  track_id text not null,
  url text not null,
  title text,
  author text,
  thumbnail text,
  requested_by text not null,
  requester_color text,
  priority boolean not null default false,
  status text not null default 'queued' check (status in ('queued','playing','played')),
  added_at timestamptz not null default now(),
  played_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_queue TO authenticated;
GRANT ALL ON public.player_queue TO service_role;

ALTER TABLE public.player_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage the shared queue"
ON public.player_queue FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX player_queue_status_idx ON public.player_queue (status, priority DESC, added_at ASC);

ALTER TABLE public.player_queue REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_queue;