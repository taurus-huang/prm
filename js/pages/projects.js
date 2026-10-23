import { requireAuth, signOut } from '../auth.js';
import { getProjects } from '../api/projects.js';
import { renderTimeline, buildMemberColors, ZOOMS, ZOOM_UNITS, LABEL_W } from '../components/timeline.js';
import { attachTodayHint } from '../components/todayHint.js';
import { attachTodayLine } from '../components/todayLine.js';
import { attachBarLabels } from '../components/barLabels.js';
import { attachWheelZoom } from '../components/wheelZoom.js';
import { captureAnchor, restoreAnchor } from '../components/scrollAnchor.js';
import { attachColumnResize } from '../components/columnResize.js';
import { getLabelW, MIN_LABEL_W } from '../components/timeAxis.js';
import { escapeHtml } from '../utils/escape.js';
import { createRowToggle, syncTriState } from '../utils/rowToggle.js';
import { STATUS_ORDER, DEFAULT_FILTERS } from '../utils/constants.js';
import { baseStatus, matchesFilter } from '../utils/status.js';

const $ = (s) => document.querySelector(s);
const timelineEl = $('#timeline');
const chipsEl = $('#chips');
const searchEl = $('#search');
const countEl = $('#count');

const store = {
  get(k, fallback) { try { return localStorage.getItem(k) || fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 忽略 */ } },
};

let projects = [];
const selected = new Set(DEFAULT_FILTERS); // 被勾選的篩選項目(預設值在 constants.js 的 DEFAULT_FILTERS)
let keyword = '';
let zoom = store.get('prm.zoom', 'quarter');
// 是否在專案長條內顯示人力配置(預設顯示)。可整體切換(右上角 tri-state checkbox),也可雙擊某個專案右邊的空白處單獨切換
const rowToggle = createRowToggle(store.get('prm.alloc', '1') !== '0');
let memberColors = new Map();
// 「專案」欄的寬度(使用者拖曳調整後會記住;預設 LABEL_W)
const LABEL_KEY = 'prm.labelW.projects';
let labelW = Math.min(600, Math.max(MIN_LABEL_W, Number(store.get(LABEL_KEY, '0')) || LABEL_W));
if (!(zoom in ZOOMS)) zoom = 'quarter';

// 篩選 checkbox:顯示「階段 : 數量」(數量 = 該狀態的專案數,各狀態加起來等於專案總數)。
// 只在資料載入後建立一次;勾選變動時不重建,鍵盤操作時焦點才不會跑掉
function renderChips() {
  chipsEl.innerHTML = STATUS_ORDER.map((key) => {
    const n = projects.filter((p) => baseStatus(p) === key).length;
    return `<label class="toggle"><input type="checkbox" data-status="${key}"${selected.has(key) ? ' checked' : ''}> ${escapeHtml(key)} : ${n}</label>`;
  }).join('');
}

function emptyMessage() {
  if (!projects.length) return '還沒有專案。請先到 Supabase 的 Table Editor 新增一筆 projects 與 milestones。';
  if (!selected.size) return '尚未勾選任何階段,請至少勾選一項。';
  return '沒有符合條件的專案,請調整搜尋或篩選。';
}

function filteredProjects() {
  const kw = keyword.toLowerCase();
  return projects.filter((p) =>
    matchesFilter(p, selected) &&
    (!kw || `${p.customer} ${p.model}`.toLowerCase().includes(kw))
  );
}

// anchor:縮放時(按鈕或 Ctrl + 滾輪)由呼叫端傳入的錨點 —— 水平保持日期、垂直保持所在的資料列。
// 篩選 / 搜尋改變時(keepCenter)只保持水平的畫面中央日期。
function render(keepCenter = false, anchor = null) {
  const rows = filteredProjects();
  document.querySelectorAll('#zoom [data-zoom]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zoom === zoom)));
  countEl.textContent = `顯示 ${rows.length} / ${projects.length} 個專案`;

  const old = timelineEl.querySelector('.tl');
  const keep = anchor ?? (old && keepCenter ? captureAnchor(old, { vertical: false }) : null);

  if (!rows.length) {
    timelineEl.innerHTML = `<div class="state-msg">${emptyMessage()}</div>`;
    return;
  }
  timelineEl.innerHTML = renderTimeline(rows, ZOOMS[zoom], ZOOM_UNITS[zoom], { showAllocations: rowToggle.isOn, memberColors, labelW });
  const tl = timelineEl.querySelector('.tl');
  if (!tl) return;

  attachColumnResize(tl, { onChange: (w) => { labelW = w; store.set(LABEL_KEY, String(w)); } }); // 拖曳「專案」欄右緣調整寬度
  if (keep) restoreAnchor(tl, keep);
  else tl.scrollLeft = Number(tl.dataset.todayX) - (tl.clientWidth - getLabelW(tl)) * 0.3; // 首次顯示:今天落在可視區 30% 處
  attachTodayHint(tl); // 今天不在畫面範圍時,日期列顯示紅色箭頭提示方向
  attachTodayLine(tl); // 紅線依現在的時間定位,並隨時間慢慢移動
  attachBarLabels(tl); // 名稱標在「目前看得到的最左邊那一段」,捲動時即時更新
}

async function main() {
  const session = await requireAuth();
  if (!session) return;

  $('#user-email').textContent = session.user.email;
  $('#logout-btn').addEventListener('click', signOut);

  chipsEl.addEventListener('change', (e) => {
    const box = e.target.closest('input[data-status]');
    if (!box) return;
    if (box.checked) selected.add(box.dataset.status);
    else selected.delete(box.dataset.status);
    render(true); // 勾選一變動,下方結果立刻更新
  });
  searchEl.addEventListener('input', () => { keyword = searchEl.value.trim(); render(true); });
  const allocBox = $('#show-alloc');
  const projectIds = () => projects.map((p) => p.id);
  const syncAllocBox = () => {
    const st = rowToggle.state(projectIds());
    syncTriState(allocBox, st);
    if (st !== 'some') store.set('prm.alloc', st === 'all' ? '1' : '0');
  };
  syncAllocBox();
  allocBox.addEventListener('change', () => { // 全部顯示 / 全部不顯示(清掉個別專案的設定)
    rowToggle.setAll(allocBox.checked);
    syncAllocBox();
    render(true);
  });
  timelineEl.addEventListener('dblclick', (e) => { // 雙擊專案右邊的時間軸區:切換該專案的人力配置顯示
    const row = e.target.closest('.tl__track')?.closest('.tl__row');
    if (!row) return;
    window.getSelection()?.removeAllRanges();
    const old = timelineEl.querySelector('.tl');
    const anchor = old ? captureAnchor(old, { clientX: e.clientX, clientY: e.clientY }) : null; // 保持被雙擊的那一列位置不動
    rowToggle.toggle(row.dataset.id);
    syncAllocBox();
    render(true, anchor);
  });
  attachWheelZoom(timelineEl, { // Ctrl + 滑鼠滾輪調整日期尺度
    getKey: () => zoom,
    onChange: (key, anchor) => {
      zoom = key;
      store.set('prm.zoom', zoom);
      render(true, anchor);
    },
  });
  $('#zoom').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-zoom]');
    if (!btn || btn.dataset.zoom === zoom) return;
    zoom = btn.dataset.zoom;
    store.set('prm.zoom', zoom);
    const old = timelineEl.querySelector('.tl');
    render(true, old ? captureAnchor(old) : null); // 按鈕縮放:保持畫面中央的日期與資料列
  });

  try {
    projects = await getProjects();
    syncAllocBox();
    memberColors = buildMemberColors(projects); // 以全部專案計算,篩選時成員顏色不會跟著變
    renderChips();
    render(false);
  } catch (err) {
    timelineEl.innerHTML = `<div class="state-msg state-msg--error">資料載入失敗:${escapeHtml(err.message)}</div>`;
  }
}

main();
