import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Browser client — uses anon key, respects RLS
export const supabase = url && anon ? createClient(url, anon) : null;

// Server client — uses service role, bypasses RLS (API routes only)
export function supabaseAdmin() {
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
