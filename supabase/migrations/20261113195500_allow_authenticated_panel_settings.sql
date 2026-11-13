-- Signed-in panel accounts can change global chat settings.
-- Maintain authentication; avoid granting access to anonymous visitors.
DROP POLICY IF EXISTS "Admins can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated panel users can update settings" ON public.app_settings;
CREATE POLICY "Authenticated panel users can update settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
