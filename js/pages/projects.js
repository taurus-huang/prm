import { requireAuth, signOut, isAdmin, getRole } from '../auth.js';
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
import { STATUS_ORDER, DEFAULT_FILTERS, ALLOC_EDGE_DRAG } from '../utils/constants.js';
import { baseStatus, matchesFilter } from '../utils/status.js';
import { openProjectDialog } from '../components/projectDialog.js';
import { openAllocationDialog } from '../components/allocationDialog.js';
import { openRowMenu } from '../components/rowMenu.js';
import { attachMilestoneEditor } from '../components/milestoneEditor.js';
import { attachAllocationEditor } from '../components/allocationEditor.js';
import { SORTS, DEFAULT_SORT, DEFAULT_DIR } from '../utils/sort.js';

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
let sortKey = store.get('prm.sort', DEFAULT_SORT); // 排序方式(會記住上次的選擇)
if (!(sortKey in SORTS)) sortKey = DEFAULT_SORT;
let sortDir = store.get('prm.sortDir', DEFAULT_DIR); // 'asc' 遞增 / 'desc' 遞減(會記住)
if (sortDir !== 'asc' && sortDir !== 'desc') sortDir = DEFAULT_DIR;
let zoom = store.get('prm.zoom', 'quarter');
// 是否在專案長條內顯示人力配置(預設顯示)。可整體切換(右上角 tri-state checkbox),也可雙擊某個專案右邊的空白處單獨切換
const rowToggle = createRowToggle(store.get('prm.alloc', '1') !== '0');
let memberColors = new Map();
let allocEditor = null; // 人力配置長條編輯(僅管理員),在 main() 裡建立
let msEditor = null; // 里程碑編輯(僅管理員),在 main() 裡建立
let canEdit = false; // 只有管理員(app_metadata.role = 'admin')能新增 / 編輯 / 刪除專案;其他帳號為唯讀
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
  if (!projects.length) return '還沒有專案。' + (canEdit ? '請按右上角的「＋ 新增專案」建立第一個專案。' : '請洽管理員新增專案。');
  if (!selected.size) return '尚未勾選任何階段,請至少勾選一項。';
  return '沒有符合條件的專案,請調整搜尋或篩選。';
}

function filteredProjects() {
  const kw = keyword.toLowerCase();
  return projects.filter((p) =>
    matchesFilter(p, selected) &&
    (!kw || `${p.customer} ${p.model}`.toLowerCase().includes(kw))
  ).sort((a, b) => SORTS[sortKey].compare(a, b, sortDir === 'desc' ? -1 : 1));
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
  timelineEl.innerHTML = renderTimeline(rows, ZOOMS[zoom], ZOOM_UNITS[zoom], { showAllocations: rowToggle.isOn, canEdit, memberColors, labelW });
  const tl = timelineEl.querySelector('.tl');
  if (!tl) return;

  attachColumnResize(tl, { onChange: (w) => { labelW = w; store.set(LABEL_KEY, String(w)); } }); // 拖曳「專案」欄右緣調整寬度
  if (keep) restoreAnchor(tl, keep);
  else tl.scrollLeft = Number(tl.dataset.todayX) - (tl.clientWidth - getLabelW(tl)) * 0.3; // 首次顯示:今天落在可視區 30% 處
  attachTodayHint(tl); // 今天不在畫面範圍時,日期列顯示紅色箭頭提示方向
  attachTodayLine(tl); // 紅線依現在的時間定位,並隨時間慢慢移動
  attachBarLabels(tl); // 名稱標在「目前看得到的最左邊那一段」,捲動時即時更新
  allocEditor?.reapplySelection(); // 人力配置編輯:重畫後保持選取中的長條
  msEditor?.reapplySelection(); // 里程碑編輯:重畫後保持選取中的菱形
}

async function main() {
  const session = await requireAuth();
  if (!session) return;

  canEdit = isAdmin(session);
  $('#add-project').hidden = !canEdit;
  $('#user-email').textContent = `${session.user.email} (${getRole(session)})`; // 帳號 email 旁顯示身份(admin / viewer …)
  $('#logout-btn').addEventListener('click', signOut);

  chipsEl.addEventListener('change', (e) => {
    const box = e.target.closest('input[data-status]');
    if (!box) return;
    if (box.checked) selected.add(box.dataset.status);
    else selected.delete(box.dataset.status);
    render(true); // 勾選一變動,下方結果立刻更新
  });
  const sortEl = $('#sort');
  sortEl.innerHTML = Object.entries(SORTS).map(([k, s]) => `<option value="${k}">${escapeHtml(s.label)}</option>`).join('');
  sortEl.value = sortKey;
  sortEl.addEventListener('change', () => { // 排序改變 → 下方結果立刻更新
    sortKey = sortEl.value;
    store.set('prm.sort', sortKey);
    render(true);
  });
  // 新增 / 編輯 / 刪除專案:完成後重新載入資料並重畫(保持目前的水平位置)
  const reload = async (savedStatus) => {
    if (savedStatus) selected.add(savedStatus); // 剛新增 / 修改的專案,其狀態若沒被勾選就自動勾上,免得存完看不到
    try {
      projects = await getProjects();
      memberColors = buildMemberColors(projects);
      renderChips();
      syncAllocBox();
      render(true);
    } catch (err) {
      alert(`重新載入失敗:${err.message}`);
    }
  };
  $('#add-project').addEventListener('click', () => { if (canEdit) openProjectDialog({ onDone: reload }); });
  const editProject = (id) => { if (!canEdit) return; const project = projects.find((p) => p.id === id); if (project) openProjectDialog({ project, onDone: reload }); };
  // 專案成員配置:完成後重新載入;若該專案目前隱藏人力配置,自動改成顯示,免得存完看不到
  const reloadAfterAlloc = ({ projectId } = {}) => {
    if (projectId && !rowToggle.isOn(projectId)) rowToggle.toggle(projectId);
    return reload(null);
  };
  // 名稱欄右上角「⋮」下拉選單:編輯專案、新增成員配置
  timelineEl.addEventListener('click', (e) => {
    const btn = canEdit ? e.target.closest('[data-menu]') : null;
    if (!btn) return;
    const id = btn.dataset.menu;
    openRowMenu(btn, [
      { label: '✎ 編輯專案', onClick: () => editProject(id) },
      { label: '＋ 新增成員配置', onClick: () => openAllocationDialog({ projectId: id, onDone: reloadAfterAlloc }) },
      { label: rowToggle.isOn(id) ? '▭ 隱藏人力配置' : '▤ 顯示人力配置', onClick: () => { rowToggle.toggle(id); syncAllocBox(); render(true); } }, // 管理員在長條內雙擊是編輯,所以也在這裡提供切換
    ]);
  });
  // 人力配置長條(僅管理員):點一下選取後可拖曳左右邊界;雙擊編輯 / 刪除;顯示人力配置時,雙擊專案長條內的空白處 → 新增配置
  allocEditor = attachAllocationEditor(timelineEl, {
    edgeDrag: ALLOC_EDGE_DRAG.projects,
    canEdit: () => canEdit,
    findAllocation: (id) => projects.flatMap((p) => p.allocations || []).find((a) => a.id === id),
    refresh: (anchor) => render(true, anchor),
    blankArea: (e, row) => !!e.target.closest('.tl__bar') && rowToggle.isOn(row.dataset.id),
    openEdit: (allocation) => openAllocationDialog({ allocation, projectId: allocation.project_id, onDone: reloadAfterAlloc }),
    openAdd: (projectId, startDate) => openAllocationDialog({ projectId, startDate, onDone: reloadAfterAlloc }),
  });
  msEditor = attachMilestoneEditor(timelineEl, {
    canEdit: () => canEdit,
    projects: () => projects,
    allocShown: (id) => rowToggle.isOn(id),
    refresh: (anchor) => render(true, anchor),
  });
  timelineEl.addEventListener('dblclick', (e) => { // 雙擊專案名稱欄也能編輯
    if (!canEdit || e.target.closest('.tl__menu') || e.target.closest('.tl__resize')) return;
    const row = e.target.closest('.tl__label')?.closest('.tl__row');
    if (row) { window.getSelection()?.removeAllRanges(); editProject(row.dataset.id); }
  });
  const dirEl = $('#sort-dir');
  dirEl.value = sortDir;
  dirEl.addEventListener('change', () => {
    sortDir = dirEl.value;
    store.set('prm.sortDir', sortDir);
    render(true);
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
  timelineEl.addEventListener('dblclick', (e) => { // 雙擊專案右邊的時間軸區:切換該專案的人力配置顯示(管理員雙擊配置長條則是編輯配置)
    const row = e.target.closest('.tl__track')?.closest('.tl__row');
    if (!row) return;
    window.getSelection()?.removeAllRanges();
    if (msEditor?.handleDblClick(e)) return; // 管理員:雙擊里程碑名稱 / 日期 / 菱形,或在沒顯示人力配置的長條內雙擊 → 里程碑編輯,不切換顯示
    if (allocEditor?.handleDblClick(e)) return; // 管理員:雙擊配置長條 → 編輯;顯示人力配置時雙擊專案長條內空白處 → 新增配置;都不切換顯示方式(viewer 才切換)
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
