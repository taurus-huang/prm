import { todayStr } from '../utils/phase.js';
import { dayIndex, ymd } from '../utils/date.js';
import { escapeHtml } from '../utils/escape.js';
import { STATUS_LABELS, TIMELINE_PHASE_ORDER, ALLOC_EDGE_DRAG } from '../utils/constants.js';
import { baseStatus, styleStatus } from '../utils/status.js';
import { allocColor, hueForIndex } from '../utils/color.js';
import { markJoins, joinClass } from '../utils/joins.js';
import { ZOOMS, mmdd, textW, computeRange, buildAxis, RESIZE_HANDLE, dayFraction } from './timeAxis.js';

// 專案總覽頁從這裡取用縮放設定(實際定義在 timeAxis.js,與人力資源總覽共用)
export { LABEL_W, ZOOMS, ZOOM_UNITS } from './timeAxis.js';
import { LABEL_W } from './timeAxis.js';

// 版面常數(px)
const BAR_H = 22;       // 長條高度
const LV_STEP = 15;     // 標籤太擠時,每錯開一層增加的高度
const MAX_LEVEL = 2;    // 最多錯開 3 層
const LANE_H = 14;      // 人員配置:每位成員一列的高度
const LANE_GAP = 2;     // 人員配置:列與列的間距


/* ---------- 里程碑整理 ---------- */

// 'EVT (Slim)' → 'EVT';用來在同一天時排序
function phaseRank(name) {
  const base = name.split(/[\s(（\-_/]/)[0].toUpperCase();
  const i = TIMELINE_PHASE_ORDER.indexOf(base);
  return i < 0 ? 99 : i;
}

// 取出所有有日期的里程碑(名稱是自由文字:KO、POC、EVT (Slim)…都會顯示),依日期排序
function getMilestones(p) {
  return (p.milestones || [])
    .filter((m) => m.target_date)
    .map((m) => ({
      id: m.id,
      name: String(m.phase ?? '').trim() || '(未命名)',
      date: m.target_date,
      idx: dayIndex(m.target_date),
      note: String(m.note ?? '').trim(),
    }))
    .sort((a, b) => a.idx - b.idx || phaseRank(a.name) - phaseRank(b.name));
}

/* ---------- 版面計算 ---------- */

function allDates(p) {
  const out = [];
  if (p.start_date) out.push(p.start_date);
  if (p.end_date) out.push(p.end_date);
  (p.milestones || []).forEach((m) => { if (m.target_date) out.push(m.target_date); });
  (p.allocations || []).forEach((a) => {
    if (a.start_date) out.push(a.start_date);
    if (a.end_date) out.push(a.end_date);
  });
  return out;
}

// 人員配置:每位成員一列;同一人不同期間的配置排在同一列,同一人期間重疊時才另開一列
function buildLanes(p) {
  const byMember = new Map();
  (p.allocations || []).forEach((a) => {
    if (!a.start_date || !a.end_date) return;
    const key = a.member_id ?? a.members?.name ?? a.id;
    if (!byMember.has(key)) byMember.set(key, { key, name: a.members?.name ?? '(未知成員)', role: a.members?.role ?? '', items: [] });
    byMember.get(key).items.push({
      from: dayIndex(a.start_date), to: dayIndex(a.end_date),
      pct: a.percentage, start: a.start_date, end: a.end_date, id: a.id,
    });
  });

  const members = [...byMember.values()]
    .map((m) => { m.items.sort((a, b) => a.from - b.from); return m; })
    .sort((a, b) => a.items[0].from - b.items[0].from || a.name.localeCompare(b.name));

  const lanes = [];
  members.forEach((m) => {
    const mine = [];
    m.items.forEach((it) => {
      let lane = mine.find((l) => l.end < it.from);
      if (!lane) { lane = { end: -Infinity, items: [] }; mine.push(lane); lanes.push(lane); }
      lane.items.push({ ...it, key: m.key, name: m.name, role: m.role });
      lane.end = it.to;
    });
  });
  return lanes;
}

// 專案長條:start_date ~ end_date;缺少時以里程碑 / 人員配置日期或今天補齊
function barExtent(p, ms, lanes, todayIdx) {
  const items = lanes.flatMap((l) => l.items);
  const aFrom = items.length ? Math.min(...items.map((i) => i.from)) : null;
  const aTo = items.length ? Math.max(...items.map((i) => i.to)) : null;
  let from = p.start_date ? dayIndex(p.start_date) : (ms[0]?.idx ?? aFrom);
  let to = p.end_date ? dayIndex(p.end_date) : (ms.length ? ms[ms.length - 1].idx : aTo);
  if (from === null && to === null) return null;
  if (from === null) from = to;
  if (to === null) to = Math.max(from, todayIdx);
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

// 標籤重疊時往外錯開:level 0 緊貼長條,1、2 逐層遠離
function assignLevels(ms, x) {
  const lastEnd = [];
  ms.forEach((m) => {
    const w = Math.max(textW(m.name, 12), textW(mmdd(m.idx), 11)) + 10;
    const cx = x(m.idx);
    let k = 0;
    while (k < MAX_LEVEL && lastEnd[k] !== undefined && lastEnd[k] > cx - w / 2) k += 1;
    lastEnd[k] = cx + w / 2;
    m.level = k;
  });
}

/* ---------- 繪製 ---------- */

// 每位成員一個固定色相:依姓名排序後用黃金角度分配,相鄰成員色相差距大;同一人在所有專案都是同一色
export function buildMemberColors(projects) {
  const members = new Map();
  projects.forEach((p) => (p.allocations || []).forEach((a) => {
    const key = a.member_id ?? a.members?.name ?? a.id;
    if (!members.has(key)) members.set(key, a.members?.name ?? '');
  }));
  const sorted = [...members.entries()].sort((a, b) => a[1].localeCompare(b[1]) || String(a[0]).localeCompare(String(b[0])));
  const colors = new Map();
  sorted.forEach(([key], i) => colors.set(key, hueForIndex(i)));
  return colors;
}

function renderAllocs(lanes, x, ppd, colors, rowKey, canEdit = false) {
  return lanes.map((lane, i) => {
    let named = false; // 初始畫面:同一列(同一人)在最左邊放得下姓名的那一段標示姓名;捲動後由 barLabels.js 改成「目前看得到的最左邊那一段」
    markJoins(lane.items); // 日期相連的配置,銜接處不要圓角
    return lane.items.map((it) => {
      const pct = Math.max(0, Math.min(100, Number(it.pct) || 0));
      const width = Math.max(4, (it.to - it.from + 1) * ppd);
      const nameW = Math.ceil(textW(it.name, 11) + 12);
      const showText = width >= nameW && !named; // 長條上只顯示姓名;投入 % 在滑鼠停留的提示中
      if (showText) named = true;
      const { bg, fg } = allocColor(pct, colors.get(it.key) ?? 205);
      const role = it.role ? `(${escapeHtml(it.role)})` : '';
      const group = escapeHtml(`${rowKey}|${i}`);
      return `<div class="tl__alloc${joinClass(it)}${canEdit ? ' is-editable' : ''}"${canEdit ? ` data-alloc="${escapeHtml(it.id)}"` : ''} style="left:${x(it.from).toFixed(1)}px;width:${width.toFixed(1)}px;top:calc(var(--bar-top) + ${4 + i * (LANE_H + LANE_GAP)}px);background:${bg};color:${fg}"
      data-lg="${group}" data-x="${x(it.from).toFixed(1)}" data-w="${width.toFixed(1)}" data-name-w="${nameW}" data-label-name="${escapeHtml(it.name)}" data-label-other=""
      title="${escapeHtml(it.name)}${role} ${pct}%:${escapeHtml(it.start)} ~ ${escapeHtml(it.end)}${canEdit ? '(雙擊編輯 / 刪除)' : ''}"><span class="tl__al bar-label"${showText ? '' : ' hidden'}>${escapeHtml(showText ? it.name : '')}</span>${canEdit && ALLOC_EDGE_DRAG ? '<i class="alloc-h" data-h="l"></i><i class="alloc-h" data-h="r"></i>' : ''}</div>`;
    }).join('');
  }).join('');
}

function renderRow(row, ctx) {
  const { p, ms, ext, lanes } = row;
  const { startIdx, ppd, totalW } = ctx;
  const x = (i) => (i - startIdx) * ppd;
  const status = baseStatus(p);
  const barStyle = styleStatus(p); // 暫緩的專案長條用灰色虛線

  let track;
  if (!ext) {
    track = '<span class="tl__undated">尚未設定期間或里程碑</span>';
  } else {
    const tall = row.barH > BAR_H; // 專案長條較高(多位成員)時,菱形上下延伸縱線到長條上下邊框
    const left = x(ext.from);
    const width = Math.max(6, (ext.to - ext.from) * ppd);
    const markers = ms.map((m) => `
      <span class="tl__ms${ctx.canEdit ? ' is-editable' : ''}"${ctx.canEdit ? ` data-ms-id="${escapeHtml(m.id)}"` : ''} style="left:${x(m.idx).toFixed(1)}px;--lv:${m.level}"
        title="${escapeHtml(m.name)} : ${escapeHtml(m.date)}${m.note ? ` , ${escapeHtml(m.note)}` : ''}${ctx.canEdit ? '\n雙擊名稱或日期可修改;雙擊菱形後可左右拖曳' : ''}">
        ${tall ? '<span class="tl__vline"></span>' : ''}
        ${m.level ? '<s class="tl__stem tl__stem--up"></s><s class="tl__stem tl__stem--dn"></s>' : ''}
        <em class="tl__md">${mmdd(m.idx)}</em>
        <i></i>
        <b class="tl__mn">${escapeHtml(m.name)}</b>
      </span>`).join('');
    track = `
      <div class="tl__bar tl__bar--${barStyle}" style="left:${left.toFixed(1)}px;width:${width.toFixed(1)}px"
        title="${escapeHtml(p.model)}:${ymd(ext.from)} ~ ${ymd(ext.to)}"></div>${ctx.isShown(p.id) ? renderAllocs(lanes, x, ppd, ctx.colors, p.id, ctx.canEdit) : ''}${markers}`;
  }

  return `
    <div class="tl__row" data-id="${escapeHtml(p.id)}" style="--bar-h:${row.barH}px;--row-h:${row.rowH}px">
      <div class="tl__label">
        <div class="tl__model" title="${escapeHtml(p.customer)} ${escapeHtml(p.model)}"><span class="tl__customer">${escapeHtml(p.customer)}</span> <span class="tl__modelname">${escapeHtml(p.model)}</span></div>
        ${ctx.canEdit ? `<button type="button" class="tl__menu" data-menu="${escapeHtml(p.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="更多操作" title="更多操作(編輯專案、新增成員配置)">⋮</button>` : ''}
        <div class="tl__sub">
          <span class="badge badge--${status}">${escapeHtml(STATUS_LABELS[status].split(' ')[0])}</span>
        </div>
      </div>
      <div class="tl__track" style="width:${totalW}px">${track}</div>
    </div>`;
}

/**
 * @param projects  含 milestones 的專案陣列
 * @param ppd       每天幾個 px(縮放比例)
 * @param unit      刻度單位:'month' | 'quarter' | 'year'(每一格代表多久)
 * @param opts      { showAllocations: 是否在專案長條內顯示人力配置(true/false,或 (專案id) => boolean 逐專案決定;預設 true), memberColors: 成員顏色表, canEdit: 是否顯示專案名稱欄的「⋮」選單與可雙擊編輯的配置長條(僅管理員) }
 */
export function renderTimeline(projects, ppd = ZOOMS.quarter, unit = 'quarter', opts = {}) {
  const isShown = typeof opts.showAllocations === 'function' ? opts.showAllocations : () => opts.showAllocations !== false;
  const labelW = opts.labelW ?? LABEL_W; // 左側名稱欄寬度(使用者拖曳調整後由頁面記住並傳入)
  const colors = opts.memberColors ?? buildMemberColors(projects);
  if (!projects.length) return '<div class="state-msg">沒有符合條件的專案。</div>';

  const todayIdx = dayIndex(todayStr());
  const { start: startIdx, end } = computeRange(projects.flatMap(allDates), todayIdx, unit);
  const totalW = Math.round((end - startIdx) * ppd);
  const x = (i) => (i - startIdx) * ppd;

  // 整理每個專案的里程碑、人員配置、長條範圍與標籤層級
  const rows = projects // 專案的排列順序由呼叫端(專案總覽的排序選單)決定
    .map((p) => {
      const ms = getMilestones(p);
      assignLevels(ms, x);
      const lanes = buildLanes(p);
      return { p, ms, lanes, ext: barExtent(p, ms, lanes, todayIdx) };
    });

  // 標籤錯開層數(所有列一致)決定上下留白;長條高度則依各專案的配置人數增加
  const maxLevel = Math.max(0, ...rows.flatMap((r) => r.ms.map((m) => m.level)));
  const barTop = LV_STEP * (maxLevel + 1) + 6;
  rows.forEach((r) => {
    const n = isShown(r.p.id) ? r.lanes.length : 0;
    r.barH = Math.max(BAR_H, n ? 8 + n * LANE_H + (n - 1) * LANE_GAP : 0);
    r.rowH = barTop + r.barH + 6 + LV_STEP * (maxLevel + 1) + 4;
  });

  const { ticks, gridlines, band, shade, headH } = buildAxis({ startIdx, end, ppd, unit });

  const todayX = x(todayIdx + dayFraction()); // 紅線畫在「今天那一格裡、依現在幾點幾分的比例」的位置
  const ctx = { startIdx, ppd, totalW, isShown, colors, canEdit: opts.canEdit === true };
  const rowsHtml = rows.map((r) => renderRow(r, ctx)).join('');

  return `
    <div class="tl" data-start-idx="${startIdx}" data-ppd="${ppd}" data-today-x="${todayX.toFixed(1)}"
         style="--label-w:${labelW}px;--bar-top:${barTop}px;--bar-h:${BAR_H}px;--row-h:${barTop + BAR_H + 10 + LV_STEP * (maxLevel + 1)}px${headH ? `;--head-h:${headH}px` : ''}">
      <div class="tl__inner" style="width:calc(var(--label-w) + ${totalW}px)">${shade}
        <div class="tl__head">
          <div class="tl__corner">專案${RESIZE_HANDLE}</div>
          <div class="tl__axis" style="width:${totalW}px">
            ${ticks}${band}
            <span class="tl__today-flag" style="left:${todayX.toFixed(1)}px">今天 ${mmdd(todayIdx)}</span>
          </div>
        </div>
        ${rowsHtml}
        <div class="tl__overlay" style="width:${totalW}px">
          ${gridlines}
          <i class="tl__today" style="left:${todayX.toFixed(1)}px"></i>
        </div>
      </div>
    </div>`;
}
