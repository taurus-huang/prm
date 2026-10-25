import { supabase } from '../supabaseClient.js';

// ---------- 里程碑單筆新增 / 修改(RLS 只允許管理員寫入,見 roles.sql) ----------

// changes:{ phase?, target_date?, note? }
export async function updateMilestone(id, changes) {
  const { error } = await supabase.from('milestones').update(changes).eq('id', id);
  if (error) throw error;
}

// 回傳新建立的那一筆(含 id)
export async function createMilestone(projectId, phase, targetDate, note = null) {
  const { data, error } = await supabase
    .from('milestones')
    .insert({ project_id: projectId, phase, target_date: targetDate, note: note || null })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
