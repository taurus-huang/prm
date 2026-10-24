import { supabase } from '../supabaseClient.js';

// ---------- 專案成員配置(allocations)新增 / 修改 / 刪除(RLS 只允許管理員寫入,見 roles.sql) ----------

// fields:{ project_id, member_id, start_date, end_date, percentage }
const row = (f) => ({
  project_id: f.project_id,
  member_id: f.member_id,
  start_date: f.start_date,
  end_date: f.end_date,
  percentage: Number(f.percentage),
});

export async function createAllocation(fields) {
  const { error } = await supabase.from('allocations').insert(row(fields));
  if (error) throw error;
}

export async function updateAllocation(id, fields) {
  const { error } = await supabase.from('allocations').update(row(fields)).eq('id', id);
  if (error) throw error;
}

export async function deleteAllocation(id) {
  const { error } = await supabase.from('allocations').delete().eq('id', id);
  if (error) throw error;
}
