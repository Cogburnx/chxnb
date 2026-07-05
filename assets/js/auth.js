import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "./supabase-config.js";

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

export function requireConfiguration() {
  if (!supabase) {
    throw new Error("登录服务尚未配置，请联系站长。");
  }
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signUp(email, password) {
  requireConfiguration();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/account.html` },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  requireConfiguration();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function sendPasswordReset(email) {
  requireConfiguration();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/account.html?reset=1`,
  });
  if (error) throw error;
}

export async function signOut() {
  requireConfiguration();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
