// 日期一律轉成「自 1970-01-01 起的天數」(day index) 再計算,避開時區與夏令時間問題
const DAY = 86400000;

export function dayIndex(str) {            // 'YYYY-MM-DD' → 天數
  const [y, m, d] = str.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}

export function ymd(idx) {                 // 天數 → 'YYYY-MM-DD'
  return new Date(idx * DAY).toISOString().slice(0, 10);
}

// idx 所在月份的第 1 天,再偏移 n 個月(n=0 即「當月 1 日」)
export function addMonths(idx, n) {
  const d = new Date(idx * DAY);
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) / DAY);
}

export function monthOf(idx) {
  const d = new Date(idx * DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
