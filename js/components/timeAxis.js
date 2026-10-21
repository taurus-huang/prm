// 時間軸共用:專案總覽與人力資源總覽使用同一套日期軸(刻度、縮放、顯示範圍)
import { dayIndex, addMonths, ymd, monthOf } from '../utils/date.js';
import { escapeHtml } from '../utils/escape.js';
import { HOLIDAYS, MAKEUP_WORKDAYS, HOLIDAY_SHADE_UNITS } from '../utils/constants.js';

export const LABEL_W = 200; // 左側名稱欄的預設寬度(px);實際寬度記在 .tl 的 CSS 變數 --label-w 上,使用者可拖曳調整
export const MIN_LABEL_W = 120; // 名稱欄最窄(px)

// 目前的名稱欄寬(px):讀 .tl 的 --label-w,沒有就用預設值
export function getLabelW(tl) {
  return parseFloat(tl.style.getPropertyValue('--label-w')) || LABEL_W;
}

// 把名稱欄寬限制在合理範圍:至少 MIN_LABEL_W;至少留 240px 給日期軌道(視窗太窄時),最多 600px
export function clampLabelW(tl, w) {
  const max = tl.clientWidth ? Math.max(MIN_LABEL_W, Math.min(600, tl.clientWidth - 240)) : 600;
  return Math.round(Math.min(max, Math.max(MIN_LABEL_W, w)));
}

// 設定名稱欄寬(所有版面都用 var(--label-w),所以會立刻生效)。並通知依賴欄寬的元件(今天箭頭、名稱標示)重新計算
export function setLabelW(tl, w) {
  const v = clampLabelW(tl, w);
  tl.style.setProperty('--label-w', `${v}px`);
  tl.dispatchEvent(new Event('labelwidth'));
  return v;
}

// 左上角標題格右緣的拖曳把手(兩個頁面共用)
export const RESIZE_HANDLE = '<span class="tl__resize" role="separator" aria-orientation="vertical" aria-label="調整欄寬" tabindex="0" title="拖曳調整欄寬(雙擊還原預設寬度)"></span>';

// 縮放比例:每一天佔幾個 px。順序由細到粗:日、週、旬、月、季、年
export const ZOOMS = { day: 40, week: 14, tenday: 9, month: 6, quarter: 2.5, year: 0.9 };

// 每一格刻度代表的時間單位:
//   day=1 天、week=1 週(週一到週日)、tenday=1 旬(上旬 1~10 日、中旬 11~20 日、下旬 21 日~月底)、
//   month=1 個月、quarter=3 個月(1~3、4~6、7~9、10~12 月)、year=1 年(1~12 月)
export const ZOOM_UNITS = { day: 'day', week: 'week', tenday: 'tenday', month: 'month', quarter: 'quarter', year: 'year' };
export const ZOOM_ORDER = ['day', 'week', 'tenday', 'month', 'quarter', 'year']; // 由細到粗,Ctrl + 滾輪依此順序切換
export const UNIT_MONTHS = { month: 1, quarter: 3, year: 12 }; // 以「月」為單位的刻度

export const mmdd = (idx) => ymd(idx).slice(5).replace('-', '/');

// 粗估文字寬度(中日韓字寬、英數字窄),用來判斷文字放不放得進長條或會不會重疊
export function textW(str, fs) {
  let w = 0;
  for (const ch of str) w += ch.charCodeAt(0) > 0x2e80 ? fs * 1.05 : fs * 0.58;
  return w;
}

const DAY = 86400000;
const WEEKDAY_CHARS = ['日', '一', '二', '三', '四', '五', '六'];
const weekdayOf = (idx) => (((idx + 4) % 7) + 7) % 7; // 0=週日 … 6=週六(1970-01-01 是週四)
const dayOfMonth = (idx) => new Date(idx * DAY).getUTCDate();
const makeupSet = new Set(MAKEUP_WORKDAYS);

// 某一天的休假資訊:週六日預設休假,HOLIDAYS 內的平日也休假,MAKEUP_WORKDAYS 內的週六日要上班
export function dayInfo(idx) {
  const date = ymd(idx);
  const wd = weekdayOf(idx);
  const weekend = wd === 0 || wd === 6;
  const makeup = weekend && makeupSet.has(date);
  const holiday = HOLIDAYS[date] ?? '';
  return { date, wd, makeup, holiday, off: !makeup && (weekend || Boolean(holiday)) };
}

// 往前對齊到該單位的邊界(週:週一;旬:1/11/21 日;季:1/4/7/10 月 1 日;年:1 月 1 日)
export function alignDown(idx, unit) {
  if (unit === 'day') return idx;
  if (unit === 'week') return idx - ((weekdayOf(idx) + 6) % 7);
  if (unit === 'tenday') {
    const d = dayOfMonth(idx);
    return idx - (d - (d <= 10 ? 1 : d <= 20 ? 11 : 21));
  }
  const step = UNIT_MONTHS[unit] ?? 1;
  const { month } = monthOf(idx);
  return addMonths(idx, -((month - 1) % step));
}

// 下一個邊界(idx 必須已經對齊)
export function nextBoundary(idx, unit) {
  if (unit === 'day') return idx + 1;
  if (unit === 'week') return idx + 7;
  if (unit === 'tenday') return dayOfMonth(idx) >= 21 ? addMonths(idx, 1) : idx + 10;
  return addMonths(idx, UNIT_MONTHS[unit] ?? 1);
}

// 時間軸顯示範圍:涵蓋所有日期與今天,前後留白,並對齊刻度邊界讓每一格都是完整的一天/週/旬/月/季/年
export function computeRange(dateStrs, todayIdx, unit) {
  const idxs = [todayIdx, ...dateStrs.map((d) => dayIndex(d))];
  const start = alignDown(addMonths(Math.min(...idxs), -1), unit);
  let end = nextBoundary(alignDown(addMonths(Math.max(...idxs), 2), unit), unit);
  while (end - start < 270) end = nextBoundary(end, unit);
  return { start, end };
}

// 刻度(日期列,標籤置中於每一格)與格線。
// 日 / 週 / 旬 為「細尺度」:日期列分兩層(上層顯示年月,下層顯示日 / 週 / 旬),日尺度另外標示休假日
export function buildAxis({ startIdx, end, ppd, unit }) {
  const x = (i) => (i - startIdx) * ppd;
  const fine = unit === 'day' || unit === 'week' || unit === 'tenday';
  let ticks = '';
  let gridlines = '';
  let shade = '';
  let prevYear = null;

  for (let c = startIdx, k = 0; c < end; c = nextBoundary(c, unit), k += 1) {
    const n = nextBoundary(c, unit);
    const cellW = x(n) - x(c); // 這一格的寬度,讓日期置中顯示
    const pos = `left:${x(c).toFixed(1)}px;width:${cellW.toFixed(1)}px`;

    if (unit === 'day') {
      const info = dayInfo(c);
      const tip = `${info.date} 星期${WEEKDAY_CHARS[info.wd]}${info.holiday ? `・${info.holiday}` : ''}${info.makeup ? '・補班' : ''}`;
      ticks += `<span class="tl__tick tl__tick--sub${info.off ? ' tl__tick--off' : ''}" style="${pos}" title="${escapeHtml(tip)}"><span class="tl__d">${dayOfMonth(c)}</span><span class="tl__w">${WEEKDAY_CHARS[info.wd]}</span></span>`;
    } else if (unit === 'week') {
      const { month: m1 } = monthOf(c);
      const { month: m2 } = monthOf(n - 1);
      const label = `${m1}/${dayOfMonth(c)}~${m2 === m1 ? '' : `${m2}/`}${dayOfMonth(n - 1)}`;
      ticks += `<span class="tl__tick tl__tick--sub" style="${pos}" title="${escapeHtml(`${ymd(c)} ~ ${ymd(n - 1)}`)}">${label}</span>`;
    } else if (unit === 'tenday') {
      const label = ['上旬', '中旬', '下旬'][Math.floor((dayOfMonth(c) - 1) / 10)];
      ticks += `<span class="tl__tick tl__tick--sub" style="${pos}" title="${escapeHtml(`${ymd(c)} ~ ${ymd(n - 1)}`)}">${label}</span>`;
    } else {
      const { year, month } = monthOf(c);
      const newYear = k === 0 || year !== prevYear;
      prevYear = year;
      let label;
      if (unit === 'year') label = `${year}年`;
      else if (unit === 'quarter') label = `${newYear ? `${year}年 ` : ''}Q${Math.floor((month - 1) / 3) + 1}(${month}~${month + 2}月)`;
      else label = newYear ? `${year}年${month}月` : `${month}月`;
      ticks += `<span class="tl__tick" style="${pos}">${label}</span>`;
    }
    gridlines += `<i class="tl__gl" style="left:${x(c).toFixed(1)}px"></i>`;
  }

  // 休假日底色(哪些尺度要標示由 constants.js 的 HOLIDAY_SHADE_UNITS 決定):
  // 逐天判斷,相鄰的休假日合併成一塊(例如週六日、連續的春節假期各是一塊),不會出現接縫
  if (HOLIDAY_SHADE_UNITS.includes(unit)) {
    let runStart = null;
    for (let c = startIdx; c <= end; c += 1) {
      const off = c < end && dayInfo(c).off;
      if (off && runStart === null) runStart = c;
      if (!off && runStart !== null) {
        shade += `<i class="tl__off" style="left:${x(runStart).toFixed(1)}px;width:${(x(c) - x(runStart)).toFixed(1)}px"></i>`;
        runStart = null;
      }
    }
  }

  // 細尺度的上層:依月份分格,顯示「2026年10月」(文字會黏在可視範圍左側,捲動時仍看得到)
  let band = '';
  if (fine) {
    for (let c = startIdx; c < end; ) {
      const nextMonth = addMonths(c, 1);
      const { year, month } = monthOf(c);
      band += `<span class="tl__band" style="left:${x(c).toFixed(1)}px;width:${(x(Math.min(nextMonth, end)) - x(c)).toFixed(1)}px"><span class="tl__band-label">${year}年${month}月</span></span>`;
      c = nextMonth;
    }
  }

  const totalW = Math.round((end - startIdx) * ppd);
  return {
    ticks,
    gridlines,
    band,
    shade: shade ? `<div class="tl__shade" style="width:${totalW}px">${shade}</div>` : '', // 休假日的底色(依 HOLIDAY_SHADE_UNITS)
    headH: unit === 'day' ? 78 : fine ? 66 : null, // 兩層日期列需要較高的標題列;月 / 季 / 年維持原本高度
  };
}
