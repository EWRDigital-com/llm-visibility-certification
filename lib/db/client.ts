import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-ONLY Supabase client using the service-role key (it bypasses RLS). The
// key must never reach the browser — only ever import this from server code
// (route handlers, server components, the audit worker). Lazy so a missing env
// var surfaces at request time with a clear message, never at import/build time.

let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
