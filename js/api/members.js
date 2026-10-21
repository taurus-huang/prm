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
