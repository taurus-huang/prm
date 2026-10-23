// 人力資源總覽的排序選項(僅限管理員使用)。dir:1 = 遞增、-1 = 遞減(所有排序鍵一起反向)。
// 沒填的值(工號、職級、職稱空白)不論遞增或遞減,一律排在最後。
const missing = (v) => v === null || v === undefined || String(v).trim() === '';
const cmp = (a, b, d, fn) => (missing(a) || missing(b) ? missing(a) - missing(b) : d * fn(a, b));
const text = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }); // 工號含數字時照數字大小排(A2 < A10)
const num = (a, b) => Number(a) - Number(b);
const byName = (a, b, d) => cmp(a.name, b.name, d, text);

export const MEMBER_SORTS = {
  employee_id: { label: '工號', compare: (a, b, d) => cmp(a.employee_id, b.employee_id, d, text) || byName(a, b, d) },
  name:        { label: '姓名', compare: (a, b, d) => byName(a, b, d) },
  job_grade:   { label: '職級', compare: (a, b, d) => cmp(a.job_grade, b.job_grade, d, num) || cmp(a.job_title, b.job_title, d, text) || byName(a, b, d) }, // job_grade → job_title
};
export const DEFAULT_MEMBER_SORT = 'name'; // 預設:姓名
export const DEFAULT_MEMBER_DIR = 'asc';
