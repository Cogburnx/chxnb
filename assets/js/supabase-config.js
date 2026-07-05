// These values are safe to expose in a browser when Supabase RLS is enabled.
export const SUPABASE_URL = "https://jfttxxemodchwhpbbaca.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ApTjdTN5JOwW8tVfzPS3yw_lH0XwSF9";

export const isSupabaseConfigured =
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_PUBLISHABLE_KEY");
