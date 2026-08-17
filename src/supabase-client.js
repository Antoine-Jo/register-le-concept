import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey?.startsWith("sb_publishable_")) {
  throw new Error("Supabase public configuration is missing");
}

const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
const pkceStorage = {
  getItem(key) {
    return key.endsWith("-code-verifier")
      ? window.localStorage.getItem(key)
      : window.sessionStorage.getItem(key);
  },
  setItem(key, value) {
    const storage = key.endsWith("-code-verifier")
      ? window.localStorage
      : window.sessionStorage;
    storage.setItem(key, value);
  },
  removeItem(key) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
    persistSession: true,
    storage: pkceStorage,
    storageKey,
  },
});

export function appUrl(path) {
  const normalizedPath = path.replace(/^\/+/, "");
  return new URL(`${import.meta.env.BASE_URL}${normalizedPath}`, window.location.origin).toString();
}

export function navigateTo(path) {
  window.location.replace(appUrl(path));
}

export async function getVerifiedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
