import { STATUS_ORDER } from './constants.js';
import { baseStatus } from './status.js';

// 專案總覽的排序選項。dir:1 = 遞增、-1 = 遞減(所有排序鍵,包含後面的次要鍵,一起反向)。
// 日期空白的專案不論遞增或遞減,一律排在最後。
const text = (a, b, d) => d * String(a ?? '').localeCompare(String(b ?? ''));
const date = (a, b, d) => (a && b ? d * a.localeCompare(b) : (a ? 0 : 1) - (b ? 0 : 1)); // 沒有日期 → 排最後
const name = (a, b, d) => text(a.customer, b.customer, d) || text(a.model, b.model, d);   // 客戶機種:customer → model
const status = (a, b, d) => d * (STATUS_ORDER.indexOf(baseStatus(a)) - STATUS_ORDER.indexOf(baseStatus(b))); // 依 STATUS_ORDER 的順序

export const SORTS = {
  name:   { label: '客戶機種', compare: (a, b, d) => name(a, b, d) },
  status: { label: '專案狀態', compare: (a, b, d) => status(a, b, d) || name(a, b, d) },
  start:  { label: '開始日期', compare: (a, b, d) => date(a.start_date, b.start_date, d) || date(a.end_date, b.end_date, d) || name(a, b, d) },
  end:    { label: '結束日期', compare: (a, b, d) => date(a.end_date, b.end_date, d) || date(a.start_date, b.start_date, d) || name(a, b, d) },
};
export const DEFAULT_SORT = 'start'; // 預設:開始日期(與原本時間軸的排列順序相同)
export const DEFAULT_DIR = 'asc';    // 預設:遞增
