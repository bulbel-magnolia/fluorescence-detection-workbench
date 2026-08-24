import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureAuthStorage } from './secureStorage';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseConfigured || !url || !anonKey) return null;
  client ??= createClient(url, anonKey, {
    auth: {
      storage: secureAuthStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-client-info': 'fluorescence-desktop/0.1.1' },
    },
  });
  return client;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ email: string } | { error: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: 'SUPABASE_NOT_CONFIGURED' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return { email: data.user.email ?? email };
}
