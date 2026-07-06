import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  SUPABASE_FALLBACK_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "./supabase-config.js";

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

const PRIMARY_BASE = stripTrailingSlash(SUPABASE_URL);
const FALLBACK_BASE = stripTrailingSlash(SUPABASE_FALLBACK_URL);

function toFallbackUrl(input) {
  const source = typeof input === "string" ? input : input?.url || "";
  if (!source) return source;

  const primary = new URL(PRIMARY_BASE, window.location.origin).toString();
  const normalizedPrimary = stripTrailingSlash(primary);

  if (!source.startsWith(normalizedPrimary)) return source;
  return `${FALLBACK_BASE}${source.slice(normalizedPrimary.length)}`;
}

function buildFallbackInput(input, fallbackUrl, init) {
  if (typeof input === "string") {
    return { request: fallbackUrl, requestInit: init };
  }

  if (input instanceof Request) {
    return { request: new Request(fallbackUrl, input), requestInit: init };
  }

  return { request: fallbackUrl, requestInit: init };
}

async function resilientFetch(input, init) {
  const originalUrl = typeof input === "string" ? input : input?.url || "";
  const fallbackUrl = toFallbackUrl(input);
  const canFallback = Boolean(fallbackUrl && fallbackUrl !== originalUrl);
  const fallbackRequest = canFallback ? buildFallbackInput(input, fallbackUrl, init) : null;

  try {
    const response = await fetch(input, init);
    if (!canFallback) {
      return response;
    }

    // If same-origin proxy path exists but returns any HTTP error, retry once with direct Supabase.
    if (response.ok) {
      return response;
    }
    return fetch(fallbackRequest.request, fallbackRequest.requestInit);
  } catch (error) {
    if (!canFallback) {
      throw error;
    }
    return fetch(fallbackRequest.request, fallbackRequest.requestInit);
  }
}

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { fetch: resilientFetch },
    })
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
