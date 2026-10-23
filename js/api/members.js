import { supabase } from '../supabaseClient.js';

// 一次取回所有成員,以及各自的人力配置(含該配置所屬專案)
export async function getMembers() {
  const { data, error } = await supabase
    .from('members')
    .select('*, allocations(*, projects(id, customer, model, status))')
    .order('name');
  if (error) throw error;
  return data;
}

// ---------- 新增 / 修改 / 刪除(RLS 只允許管理員寫入,見 roles.sql) ----------

const clean = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };

// fields:{ name, role, employee_id, extension, email, job_grade, job_title };空字串一律存成 null
function memberRow(f) {
  const grade = clean(f.job_grade);
  return {
    name: String(f.name).trim(),
    role: clean(f.role),
    employee_id: clean(f.employee_id),
    extension: clean(f.extension),
    email: clean(f.email),
    job_grade: grade === null ? null : Number(grade),
    job_title: clean(f.job_title),
  };
}

// email、工號不能與其他成員重複(資料表的 unique 限制),把資料庫的錯誤翻成看得懂的訊息
function friendly(error) {
  if (error.code === '23505') {
    if (/email/i.test(error.message)) return new Error('這個 Email 已經有其他成員使用。');
    if (/employee_id/i.test(error.message)) return new Error('這個工號已經有其他成員使用。');
    return new Error('Email 或工號與其他成員重複。');
  }
  return error;
}

export async function createMember(fields) {
  const { error } = await supabase.from('members').insert(memberRow(fields));
  if (error) throw friendly(error);
}

export async function updateMember(id, fields) {
  const { error } = await supabase.from('members').update(memberRow(fields)).eq('id', id);
  if (error) throw friendly(error);
}

// 該成員的人力配置(allocations)會因 on delete cascade 一併刪除
export async function deleteMember(id) {
  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) throw error;
}
