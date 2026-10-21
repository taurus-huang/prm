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
