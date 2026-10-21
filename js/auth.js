import { supabase } from './supabaseClient.js';

// 受保護頁面使用:未登入就導回登入頁
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.replace('index.html');
    return null;
  }
  return session;
}

// 登入頁使用:已登入就直接進系統
export async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) location.replace('projects.html');
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.replace('index.html');
}
