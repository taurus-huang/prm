import { todayStr } from '../utils/phase.js';
import { dayIndex, ymd } from '../utils/date.js';
import { escapeHtml } from '../utils/escape.js';
import { allocColor, hueForIndex } from '../utils/color.js';
import { markJoins, joinClass } from '../utils/joins.js';
import { LOAD_THRESHOLDS, SUM_COLOR_MAX, ALLOC_EDGE_DRAG } from '../utils/constants.js';
import { LABEL_W, ZOOMS, mmdd, textW, computeRange, buildAxis, RESIZE_HANDLE, dayFraction } from './timeAxis.js';

// 版面常數(px)
const LANE_H = 22;     // 每條配置長條高度
const LANE_GAP = 3;    // 同一成員多條配置(同時投入多個專案)的間距
const PAD = 8;         // 列上下留白
const MIN_ROW_H = 52;  // 列最低高度(沒有配置的成員也用這個高度)

// 每個專案一個固定色相(依「客戶 機種」排序,以全部成員的配置計算,篩選時顏色不會變)
export function buildProjectColors(members) {
  const projects = new Map();
  members.forEach((m) => (m.allocations || []).forEach((a) => {
    if (!projects.has(a.project_id)) projects.set(a.project_id, `${a.projects?.customer ?? ''} ${a.projects?.model ?? ''}`.trim());
  }));
  const sorted = [...projects.entries()].sort((a, b) => a[1].localeCompare(b[1]) || String(a[0]).localeCompare(String(b[0])));
  const colors = new Map();
  sorted.forEach(([key], i) => colors.set(key, hueForIndex(i)));
  return colors;
}

function memberItems(m) {
  return (m.allocations || [])
    .filter((a) => a.start_date && a.end_date)
    .map((a) => ({
      key: a.project_id,
      customer: a.projects?.customer ?? '',
      model: a.projects?.model ?? '(未知專案)',
      pct: a.percentage,
      start: a.start_date, end: a.end_date, id: a.id,
      from: dayIndex(a.start_date), to: dayIndex(a.end_date),
    }));
}

// 排列規則:
//  1. 同一成員的同一個專案,所有配置一定在同一列(同一條),不會被拆到上下兩列
//  2. 同一時間投入多個專案時,不同專案上下堆疊
//  3. 不同專案的時間完全不重疊(例如前後銜接)時,共用同一列以節省空間
function packLanes(items) {
  const byProject = new Map();
  items.forEach((it) => {
    if (!byProject.has(it.key)) byProject.set(it.key, []);
    byProject.get(it.key).push(it);
  });
  const groups = [...byProject.values()]
    .map((g) => g.sort((a, b) => a.from - b.from || a.to - b.to))
    .sort((a, b) => a[0].from - b[0].from || a[0].to - b[0].to);

  const overlap = (x, y) => x.from <= y.to && y.from <= x.to;
  const lanes = [];
  groups.forEach((g) => {
    // 整組(同一專案的全部配置)與該列現有配置都不重疊,才能放進去
    let lane = lanes.find((l) => !g.some((it) => l.items.some((o) => overlap(it, o))));
    if (!lane) { lane = { items: [] }; lanes.push(lane); }
    lane.items.push(...g);
  });
  return lanes;
}

function renderBars(lanes, x, ppd, colors, rowKey, canEdit = false) {
  return lanes.map((lane, i) => {
    markJoins(lane.items); // 同一專案日期相連的配置,銜接處不要圓角
    const named = new Set(); // 初始畫面:同一專案在最左邊放得下名稱的那一段標示名稱;捲動後由 barLabels.js 改成「目前看得到的最左邊那一段」
    return lane.items.map((it) => {
      const pct = Math.max(0, Math.min(100, Number(it.pct) || 0));
      const width = Math.max(4, (it.to - it.from + 1) * ppd);
      const full = `${it.model} ${pct}%`;
      const pctOnly = `${pct}%`;
      const other = width >= textW(pctOnly, 12) + 10 ? pctOnly : '';
      // 被選為標示名稱的那段:「機種 百分比」;同專案其餘各段只顯示百分比;太窄時只有色塊(看滑鼠提示)
      let text = other;
      if (!named.has(it.key) && width >= textW(full, 12) + 14) {
        text = full;
        named.add(it.key);
      }
      const { bg, fg } = allocColor(pct, colors.get(it.key) ?? 205);
      const name = `${it.customer} ${it.model}`.trim();
      const group = escapeHtml(`${rowKey}|${i}|${it.key}`);
      return `<div class="rs__bar${joinClass(it)}${canEdit ? ' is-editable' : ''}"${canEdit ? ` data-alloc="${escapeHtml(it.id)}"` : ''} style="left:${x(it.from).toFixed(1)}px;width:${width.toFixed(1)}px;top:${PAD + i * (LANE_H + LANE_GAP)}px;background:${bg};color:${fg}"
      data-lg="${group}" data-x="${x(it.from).toFixed(1)}" data-w="${width.toFixed(1)}" data-name-w="${Math.ceil(textW(full, 12) + 14)}" data-label-name="${escapeHtml(full)}" data-label-other="${escapeHtml(other)}"
      title="${escapeHtml(name)} · ${pct}% · ${escapeHtml(it.start)} ~ ${escapeHtml(it.end)}${canEdit ? '(雙擊編輯 / 刪除)' : ''}"><span class="rs__text bar-label"${text ? '' : ' hidden'}>${escapeHtml(text)}</span>${canEdit && ALLOC_EDGE_DRAG ? '<i class="alloc-h" data-h="l"></i><i class="alloc-h" data-h="r"></i>' : ''}</div>`;
    }).join('');
  }).join('');
}

// 把成員所有配置依時間切段,算出每一段「同時投入的百分比加總」
// 切點 = 每筆配置的開始日、結束日隔天;兩切點之間同時進行的配置不會變動,加總即為該段的投入%
// 相鄰且加總相同的段落合併成一段
// gapRange({from,to},天數索引)有給時:整個範圍都會切成段落,沒有配置的空檔也成為一段(加總 0%);
// 沒給時:空檔不產生段落
export function sumSegments(items, gapRange = null) {
  const valid = items.filter((it) => it.to >= it.from);
  const points = new Set(valid.flatMap((it) => [it.from, it.to + 1]));
  if (gapRange) { points.add(gapRange.from); points.add(gapRange.to + 1); }
  if (!points.size) return [];
  const pts = [...points].sort((a, b) => a - b);

  const segs = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    let from = pts[i];
    let to = pts[i + 1] - 1;
    if (gapRange) {
      from = Math.max(from, gapRange.from);
      to = Math.min(to, gapRange.to);
      if (from > to) continue;
    }
    const active = valid.filter((it) => it.from <= pts[i] && it.to >= pts[i]);
    const sum = active.reduce((acc, it) => acc + (Number(it.pct) || 0), 0);
    if (!gapRange && (!active.length || sum <= 0)) continue;
    const parts = active.map((it) => `${it.model} ${Number(it.pct) || 0}%`);
    const last = segs[segs.length - 1];
    if (last && last.to + 1 === from && last.sum === sum) {
      last.to = to;
      parts.forEach((t) => { if (!last.parts.includes(t)) last.parts.push(t); });
    } else {
      segs.push({ from, to, sum, parts });
    }
  }
  return segs;
}

// 加總的警示等級:超過上限 → 'high'(紅框);低於下限 → 'low'(藍框);否則 ''
// 沒有配置的空檔加總為 0%,所以只要 low > 0 就會被視為偏低(有空)。門檻值在 js/utils/constants.js 的 LOAD_THRESHOLDS
function levelOf(sum) {
  if (sum > LOAD_THRESHOLDS.high) return 'high';
  if (sum < LOAD_THRESHOLDS.low) return 'low';
  return '';
}

const SUM_HUE = 200; // 加總視圖:單一色相,加總 % 越高顏色越深(範圍 0% ~ SUM_COLOR_MAX%,超過的以最深色顯示,標籤仍顯示實際數字)

function renderSumBars(segs, x, ppd) {
  const items = segs.map((sg) => ({ key: 'sum', from: sg.from, to: sg.to }));
  markJoins(items); // 時間相連的段落,銜接處不要圓角
  return segs.map((sg, i) => {
    const width = Math.max(4, (sg.to - sg.from + 1) * ppd);
    // allocColor 的深淺是以 0~100 計算,所以把 0~SUM_COLOR_MAX% 的加總換算成 0~100 的比例
    const { bg, fg } = allocColor(Math.min(100, (sg.sum / SUM_COLOR_MAX) * 100), SUM_HUE);
    // const level = levelOf(sg.sum);
	const level = '';
    const note = level === 'high' ? `(超過 ${LOAD_THRESHOLDS.high}%)` : level === 'low' ? `(低於 ${LOAD_THRESHOLDS.low}%)` : '';
    // 滑鼠提示分多行(&#10; 為換行):第一行「合計 % : 期間」,之後每個專案一行
    const tip = [`合計 ${sg.sum}%${note} : ${ymd(sg.from)} ~ ${ymd(sg.to)}`, ...sg.parts].map(escapeHtml).join('&#10;');
    return `<div class="rs__bar${joinClass(items[i])}${level ? ` rs__bar--${level}` : ''}" style="left:${x(sg.from).toFixed(1)}px;width:${width.toFixed(1)}px;top:${PAD}px;background:${bg};color:${fg}"
      title="${tip}"></div>`;
  }).join('');
}

// 顯示專案配置時:加總超過上限(紅)/低於下限(藍,含空檔)的時期,在該成員的所有專案長條上方框出整個區段
function renderFrames(segs, laneCount, x, ppd) {
  const top = 5;
  const height = laneCount ? laneCount * LANE_H + (laneCount - 1) * LANE_GAP + 6 : MIN_ROW_H - 10;
  return segs.map((sg) => {
    const level = levelOf(sg.sum);
    if (!level) return '';
    const width = Math.max(4, (sg.to - sg.from + 1) * ppd);
    return `<div class="rs__frame rs__frame--${level}" style="left:${x(sg.from).toFixed(1)}px;width:${width.toFixed(1)}px;top:${top}px;height:${height}px"></div>`;
  }).join('');
}

// 滑鼠移到成員欄時,瀏覽器內建提示(title)顯示的內容:分機與 Email,各一行(&#10; 為換行)
// 注意:title 要放在外層的 .tl__label,內層元素若也有 title 會蓋掉它
function memberHintTitle(m) {
  const ext = String(m.extension ?? '').trim() || '未設定';
  const email = String(m.email ?? '').trim() || '未設定';
  return `${escapeHtml(`分機：${ext}`)}&#10;${escapeHtml(`Email：${email}`)}`;
}

function renderRow(m, ctx) {
  const items = memberItems(m);
  const range = { from: ctx.startIdx, to: ctx.endIdx };
  const none = '<span class="tl__undated">目前沒有配置</span>';
  let rowH = MIN_ROW_H;
  let track;
  if (ctx.isShown(m.id)) {
    const lanes = packLanes(items);
    const n = lanes.length;
    if (n) rowH = Math.max(MIN_ROW_H, PAD * 2 + n * LANE_H + (n - 1) * LANE_GAP);
    const bars = n ? renderBars(lanes, ctx.x, ctx.ppd, ctx.colors, m.id, ctx.canEdit) : none;
    // track = bars + renderFrames(sumSegments(items, range), n, ctx.x, ctx.ppd);
	track = bars;
  } else {
    // 0% 的時段(沒有配置的空檔、或配置百分比為 0)不畫長條也不顯示 0%,維持空白底
    const segs = sumSegments(items).filter((sg) => sg.sum > 0);
    track = segs.length ? renderSumBars(segs, ctx.x, ctx.ppd) : none;
  }
  const role = String(m.role ?? '').trim();
  return `
    <div class="tl__row" data-id="${escapeHtml(m.id)}" style="--row-h:${rowH}px">
      <div class="tl__label" title="${memberHintTitle(m)}">
        <div class="tl__model">${escapeHtml(m.name)}</div>
        ${ctx.canEdit ? `<button type="button" class="tl__menu" data-menu="${escapeHtml(m.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="更多操作" title="更多操作(編輯成員、新增專案配置)">⋮</button>` : ''}
        <div class="tl__sub">${role ? `<span class="badge badge--role">${escapeHtml(role)}</span>` : ''}</div>
      </div>
      <div class="tl__track" style="width:${ctx.totalW}px">${track}</div>
    </div>`;
}

/**
 * 人力資源總覽:橫軸日期(與專案總覽相同),縱軸每位成員
 * @param members  含 allocations(及其 projects)的成員陣列,依顯示順序排列
 * @param ppd      每天幾個 px(縮放比例)
 * @param unit     刻度單位:'month' | 'quarter' | 'year'
 * @param opts     { projectColors: 專案顏色表, canEdit: 是否顯示成員名稱欄的「⋮」選單與可雙擊編輯的配置長條(僅管理員), showProjects: 是否顯示專案配置(true/false,或 (成員id) => boolean 逐成員決定;不顯示時只顯示各時期投入%加總) }
 */
export function renderResourceTimeline(members, ppd = ZOOMS.quarter, unit = 'quarter', opts = {}) {
  if (!members.length) return '<div class="state-msg">沒有符合條件的成員。</div>';

  const colors = opts.projectColors ?? buildProjectColors(members);
  const labelW = opts.labelW ?? LABEL_W; // 左側名稱欄寬度(使用者拖曳調整後由頁面記住並傳入)
  const todayIdx = dayIndex(todayStr());
  const dates = members.flatMap((m) => (m.allocations || []).flatMap((a) => [a.start_date, a.end_date].filter(Boolean)));
  const { start: startIdx, end } = computeRange(dates, todayIdx, unit);
  const totalW = Math.round((end - startIdx) * ppd);
  const x = (i) => (i - startIdx) * ppd;
  const { ticks, gridlines, band, shade, headH } = buildAxis({ startIdx, end, ppd, unit });
  const todayX = x(todayIdx + dayFraction()); // 紅線畫在「今天那一格裡、依現在幾點幾分的比例」的位置
  const ctx = { x, ppd, totalW, colors, canEdit: opts.canEdit === true, isShown: typeof opts.showProjects === 'function' ? opts.showProjects : () => opts.showProjects !== false, startIdx, endIdx: end - 1 };

  return `
    <div class="tl" data-start-idx="${startIdx}" data-ppd="${ppd}" data-today-x="${todayX.toFixed(1)}" style="--label-w:${labelW}px${headH ? `;--head-h:${headH}px` : ''}">
      <div class="tl__inner" style="width:calc(var(--label-w) + ${totalW}px)">${shade}
        <div class="tl__head">
          <div class="tl__corner">成員${RESIZE_HANDLE}</div>
          <div class="tl__axis" style="width:${totalW}px">
            ${ticks}${band}
            <span class="tl__today-flag" style="left:${todayX.toFixed(1)}px">今天 ${mmdd(todayIdx)}</span>
          </div>
        </div>
        ${members.map((m) => renderRow(m, ctx)).join('')}
        <div class="tl__overlay" style="width:${totalW}px">
          ${gridlines}
          <i class="tl__today" style="left:${todayX.toFixed(1)}px"></i>
        </div>
      </div>
    </div>`;
}
