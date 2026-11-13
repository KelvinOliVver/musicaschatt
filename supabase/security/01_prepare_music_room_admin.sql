-- STEP 1 (non-disruptive): prepare a role table WITHOUT changing existing access.
-- Apply in the Lovable Cloud SQL editor BEFORE the authorization script.
-- Do NOT insert a random email/UUID or let any visitor claim this role.
CREATE TABLE IF NOT EXISTS public.music_room_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.music_room_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.music_room_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.music_room_admins TO authenticated;
GRANT ALL ON TABLE public.music_room_admins TO service_role;

DROP POLICY IF EXISTS "Music room admins see themselves" ON public.music_room_admins;
CREATE POLICY "Music room admins see themselves"
ON public.music_room_admins FOR SELECT TO authenticated
USING ((select auth.uid()) = user_id);

-- NEXT: Use a privileged SQL editor to identify the real streamer user:
--   SELECT id, email FROM auth.users ORDER BY created_at;
-- Then manually authorize ONLY that identity:
--   INSERT INTO public.music_room_admins (user_id) VALUES ('<confirmed-user-uuid>')
--   ON CONFLICT (user_id) DO NOTHING;
-- Verify with SELECT * FROM public.music_room_admins; before STEP 2.
