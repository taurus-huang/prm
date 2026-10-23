import { requireAuth, signOut, getRole, isAdmin } from '../auth.js';
import { getMembers } from '../api/members.js';
import { renderResourceTimeline, buildProjectColors } from '../components/resourceTimeline.js';
import { ZOOMS, ZOOM_UNITS, LABEL_W, MIN_LABEL_W, getLabelW } from '../components/timeAxis.js';
import { attachTodayHint } from '../components/todayHint.js';
import { attachTodayLine } from '../components/todayLine.js';
import { attachBarLabels } from '../components/barLabels.js';
import { attachWheelZoom } from '../components/wheelZoom.js';
import { captureAnchor, restoreAnchor } from '../components/scrollAnchor.js';
import { attachColumnResize } from '../components/columnResize.js';
import { escapeHtml } from '../utils/escape.js';
import { createRowToggle, syncTriState } from '../utils/rowToggle.js';
import { openMemberDialog } from '../components/memberDialog.js';
import { MEMBER_SORTS, DEFAULT_MEMBER_SORT, DEFAULT_MEMBER_DIR } from '../utils/memberSort.js';

const $ = (s) => document.querySelector(s);
const timelineEl = $('#timeline');
const chipsEl = $('#chips');
const searchEl = $('#search');
const countEl = $('#count');

const store = {
  get(k, fallback) { try { return localStorage.getItem(k) || fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 忽略 */ } },
};

const NO_ROLE = '(未設定)';
const roleOf = (m) => String(m.role ?? '').trim() || NO_ROLE;

let members = [];
let activeRole = 'ALL';
let keyword = '';
// 排序只有管理員能用;非管理員永遠是預設順序(依職務、姓名)。選擇會記住
let canSort = false;
let canEdit = false; // 只有管理員能新增 / 編輯 / 刪除成員;其他帳號為唯讀
let sortKey = store.get('prm.rsSort', DEFAULT_MEMBER_SORT);
if (!(sortKey in MEMBER_SORTS)) sortKey = DEFAULT_MEMBER_SORT;
let sortDir = store.get('prm.rsSortDir', DEFAULT_MEMBER_DIR);
if (sortDir !== 'asc' && sortDir !== 'desc') sortDir = DEFAULT_MEMBER_DIR;
let zoom = store.get('prm.zoom', 'quarter'); // 與專案總覽共用縮放偏好
// 是否顯示專案配置(預設顯示);不顯示時只顯示各時期投入%加總。可整體切換(右上角 tri-state checkbox),也可雙擊某位成員右邊的空白處單獨切換
const rowToggle = createRowToggle(store.get('prm.rsProjects', '1') !== '0');
let projectColors = new Map();
// 「成員」欄的寬度(使用者拖曳調整後會記住;預設 LABEL_W)
const LABEL_KEY = 'prm.labelW.resources';
let labelW = Math.min(600, Math.max(MIN_LABEL_W, Number(store.get(LABEL_KEY, '0')) || LABEL_W));
if (!(zoom in ZOOMS)) zoom = 'quarter';

// 職務篩選按鈕(依 members.role):只有成員的職務分成「兩類以上」時才顯示。
// 若大家職務都沒填(都是「未設定」)或全都一樣,點任何按鈕結果都相同,按鈕沒有作用,所以不顯示。
function renderChips() {
  const counts = new Map();
  members.forEach((m) => counts.set(roleOf(m), (counts.get(roleOf(m)) ?? 0) + 1));
  chipsEl.hidden = counts.size < 2;
  if (chipsEl.hidden) { chipsEl.innerHTML = ''; activeRole = 'ALL'; return; }
  const roles = [...counts.keys()].sort((a, b) => (a === NO_ROLE) - (b === NO_ROLE) || a.localeCompare(b));
  const defs = [['ALL', '全部', members.length], ...roles.map((r) => [r, r, counts.get(r)])];
  chipsEl.innerHTML = defs.map(([key, label, n]) =>
    `<button type="button" class="chip" data-role="${escapeHtml(key)}" aria-pressed="${key === activeRole}">${escapeHtml(label)} ${n}</button>`
  ).join('');
}

// 依職務、姓名排序;可用職務與關鍵字(姓名、工號)篩選
function filteredMembers() {
  const kw = keyword.toLowerCase();
  return members
    .filter((m) => (activeRole === 'ALL' || roleOf(m) === activeRole)
      && (!kw || `${m.name} ${m.employee_id ?? ''}`.toLowerCase().includes(kw)))
    .sort((a, b) => (canSort && sortKey in MEMBER_SORTS)
      ? MEMBER_SORTS[sortKey].compare(a, b, sortDir === 'desc' ? -1 : 1)
      : (roleOf(a) === NO_ROLE) - (roleOf(b) === NO_ROLE) || roleOf(a).localeCompare(roleOf(b)) || a.name.localeCompare(b.name));
}

function render(keepCenter = false, anchor = null) {
  const rows = filteredMembers();
  countEl.textContent = `顯示 ${rows.length} / ${members.length} 位成員`;
  $('#zoom').querySelectorAll('[data-zoom]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zoom === zoom)));

  // anchor:縮放時(按鈕或 Ctrl + 滾輪)由呼叫端傳入的錨點 —— 水平保持日期、垂直保持所在的成員列。
  // 篩選 / 搜尋改變時(keepCenter)只保持水平的畫面中央日期。
  const old = timelineEl.querySelector('.tl');
  const keep = anchor ?? (old && keepCenter ? captureAnchor(old, { vertical: false }) : null);

  if (!rows.length) {
    timelineEl.innerHTML = `<div class="state-msg">${members.length ? '沒有符合條件的成員,請調整搜尋或篩選。' : '還沒有成員。' + (canEdit ? '請按右上角的「＋ 新增成員」建立第一位成員。' : '請洽管理員新增成員。') + ''}</div>`;
    return;
  }
  timelineEl.innerHTML = renderResourceTimeline(rows, ZOOMS[zoom], ZOOM_UNITS[zoom], { projectColors, showProjects: rowToggle.isOn, labelW, canEdit });
  const tl = timelineEl.querySelector('.tl');
  attachColumnResize(tl, { onChange: (w) => { labelW = w; store.set(LABEL_KEY, String(w)); } }); // 拖曳「成員」欄右緣調整寬度
  if (keep) restoreAnchor(tl, keep);
  else tl.scrollLeft = Number(tl.dataset.todayX) - (tl.clientWidth - getLabelW(tl)) * 0.3; // 首次顯示:今天落在可視區 30% 處
  attachTodayHint(tl); // 今天不在畫面範圍時,日期列顯示紅色箭頭提示方向
  attachTodayLine(tl); // 紅線依現在的時間定位,並隨時間慢慢移動
  attachBarLabels(tl); // 名稱標在「目前看得到的最左邊那一段」,捲動時即時更新
}

async function main() {
  const session = await requireAuth();
  if (!session) return;

  $('#user-email').textContent = `${session.user.email} (${getRole(session)})`; // 帳號 email 旁顯示身份(admin / viewer …)
  $('#logout-btn').addEventListener('click', signOut);

  canEdit = isAdmin(session); // 新增 / 編輯 / 刪除成員、排序功能僅限管理員
  $('#add-member').hidden = !canEdit;
  canSort = canEdit;
  $('#sort-box').hidden = !canSort;
  if (canSort) {
    const sortEl = $('#sort');
    const dirEl = $('#sort-dir');
    sortEl.innerHTML = Object.entries(MEMBER_SORTS).map(([k, s]) => `<option value="${k}">${escapeHtml(s.label)}</option>`).join('');
    sortEl.value = sortKey;
    dirEl.value = sortDir;
    sortEl.addEventListener('change', () => {
      sortKey = sortEl.value;
      store.set('prm.rsSort', sortKey);
      render(true);
    });
    dirEl.addEventListener('change', () => {
      sortDir = dirEl.value;
      store.set('prm.rsSortDir', sortDir);
      render(true);
    });
  }

  // 新增 / 編輯 / 刪除成員:完成後重新載入資料並重畫(保持目前的水平位置)
  const reload = async (savedRole) => {
    if (savedRole && activeRole !== 'ALL' && activeRole !== savedRole) activeRole = 'ALL'; // 剛存的成員若被職務篩選擋掉,改回「全部」免得看不到
    try {
      members = await getMembers();
      projectColors = buildProjectColors(members);
      renderChips();
      syncProjBox();
      render(true);
    } catch (err) {
      alert(`重新載入失敗:${err.message}`);
    }
  };
  const knownRoles = () => [...new Set(members.map((m) => String(m.role ?? '').trim()).filter(Boolean))].sort();
  $('#add-member').addEventListener('click', () => { if (canEdit) openMemberDialog({ roles: knownRoles(), onDone: reload }); });
  const editMember = (id) => { if (!canEdit) return; const member = members.find((m) => m.id === id); if (member) openMemberDialog({ member, roles: knownRoles(), onDone: reload }); };
  timelineEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (btn) editMember(btn.dataset.edit);
  });
  timelineEl.addEventListener('dblclick', (e) => { // 雙擊成員名稱欄也能編輯
    if (!canEdit || e.target.closest('.tl__edit') || e.target.closest('.tl__resize')) return;
    const row = e.target.closest('.tl__label')?.closest('.tl__row');
    if (row) { window.getSelection()?.removeAllRanges(); editMember(row.dataset.id); }
  });
  chipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role]');
    if (!btn) return;
    activeRole = btn.dataset.role;
    renderChips();
    render(true);
  });
  searchEl.addEventListener('input', () => { keyword = searchEl.value.trim(); render(true); });
  const projBox = $('#show-projects');
  const memberIds = () => members.map((m) => m.id);
  const syncProjBox = () => {
    const st = rowToggle.state(memberIds());
    syncTriState(projBox, st);
    if (st !== 'some') store.set('prm.rsProjects', st === 'all' ? '1' : '0');
  };
  syncProjBox();
  projBox.addEventListener('change', () => { // 全部顯示 / 全部不顯示(清掉個別成員的設定)
    rowToggle.setAll(projBox.checked);
    syncProjBox();
    render(true);
  });
  timelineEl.addEventListener('dblclick', (e) => { // 雙擊成員右邊的配置區:切換該成員的顯示方式
    const row = e.target.closest('.tl__track')?.closest('.tl__row');
    if (!row) return;
    window.getSelection()?.removeAllRanges();
    const old = timelineEl.querySelector('.tl');
    const anchor = old ? captureAnchor(old, { clientX: e.clientX, clientY: e.clientY }) : null; // 保持被雙擊的那一列位置不動
    rowToggle.toggle(row.dataset.id);
    syncProjBox();
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
    render(true, old ? captureAnchor(old) : null); // 按鈕縮放:保持畫面中央的日期與成員列
  });

  try {
    members = await getMembers();
    syncProjBox();
    projectColors = buildProjectColors(members); // 以全部成員計算,篩選時專案顏色不會變
    renderChips();
    render(false);
  } catch (err) {
    timelineEl.innerHTML = `<div class="state-msg state-msg--error">資料載入失敗:${escapeHtml(err.message)}</div>`;
  }
}

main();
