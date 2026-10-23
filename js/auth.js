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

// 登入者的身份:優先讀 app_metadata.role(Supabase 的 raw_app_meta_data,只有後台能改),
// 沒有才讀 user_metadata.role(Supabase 的 raw_user_meta_data);都沒有就是 'viewer'。
// 注意:這只決定畫面上要不要顯示功能,真正的權限由資料庫的 RLS 把關(見 roles.sql)。
export const getRole = (session) => {
  const u = session?.user;
  return String(u?.app_metadata?.role ?? u?.user_metadata?.role ?? 'viewer').trim().toLowerCase() || 'viewer';
};
export const isAdmin = (session) => getRole(session) === 'admin';

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.replace('index.html');
}
