import { supabase } from '../supabaseClient.js';

// 一次取回專案、里程碑,以及人員配置(含成員姓名與職務)
export async function getProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*, milestones(*), allocations(*, members(name, role))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ---------- 新增 / 修改 / 刪除(RLS 只允許登入的使用者) ----------

const clean = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };

// fields:{ customer, model, status, start_date, end_date, note };空字串一律存成 null
function projectRow(f) {
  return {
    customer: String(f.customer).trim(),
    model: String(f.model).trim(),
    status: f.status,
    start_date: clean(f.start_date),
    end_date: clean(f.end_date),
    note: clean(f.note),
  };
}
const milestoneRow = (m, projectId) => ({
  project_id: projectId, phase: String(m.phase).trim(), target_date: clean(m.target_date), note: clean(m.note),
});

// milestones:[{ phase, target_date, note }]
export async function createProject(fields, milestones) {
  const { data, error } = await supabase.from('projects').insert(projectRow(fields)).select('id').single();
  if (error) throw error;
  if (milestones.length) {
    const { error: e2 } = await supabase.from('milestones').insert(milestones.map((m) => milestoneRow(m, data.id)));
    if (e2) throw new Error(`專案已建立,但里程碑儲存失敗:${e2.message}`);
  }
  return data.id;
}

// milestones:[{ id?, phase, target_date, note }] —— 有 id 的更新、沒有 id 的新增、原本有但這次沒有的刪除
export async function updateProject(id, fields, milestones, originalMilestones = []) {
  const { error } = await supabase.from('projects').update({ ...projectRow(fields), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;

  const keep = new Set(milestones.filter((m) => m.id).map((m) => m.id));
  const removed = originalMilestones.map((m) => m.id).filter((mid) => !keep.has(mid));
  if (removed.length) {
    const { error: e } = await supabase.from('milestones').delete().in('id', removed);
    if (e) throw new Error(`專案已更新,但里程碑刪除失敗:${e.message}`);
  }
  for (const m of milestones.filter((x) => x.id)) {
    const { project_id, ...row } = milestoneRow(m, id);
    const { error: e } = await supabase.from('milestones').update(row).eq('id', m.id);
    if (e) throw new Error(`專案已更新,但里程碑儲存失敗:${e.message}`);
  }
  const added = milestones.filter((m) => !m.id);
  if (added.length) {
    const { error: e } = await supabase.from('milestones').insert(added.map((m) => milestoneRow(m, id)));
    if (e) throw new Error(`專案已更新,但里程碑儲存失敗:${e.message}`);
  }
}

// 里程碑與人力配置會因 on delete cascade 一併刪除
export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}
