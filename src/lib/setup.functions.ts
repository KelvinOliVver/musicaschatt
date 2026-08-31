import { createServerFn } from "@tanstack/react-start";

/**
 * Tells the login page whether the very first account still needs to be
 * created. Once an account exists, sign-up is closed for good.
 */
export const isSignupOpen = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error) return { open: false };
  return { open: (count ?? 0) === 0 };
});
