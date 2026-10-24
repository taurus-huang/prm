import { updateAllocation } from '../api/allocations.js';
import { captureAnchor } from './scrollAnchor.js';
import { dayIndex, ymd } from '../utils/date.js';
import { ALLOC_EDGE_DRAG } from '../utils/constants.js';

// 時間軸上的人力配置(allocation)長條編輯(僅管理員),專案總覽與人力資源總覽共用:
//  1. (目前關閉,見 constants.js 的 ALLOC_EDGE_DRAG)點一下配置長條 → 外框變色(琥珀色)= 選取,此時可拖曳左右邊界改開始 / 結束日期(游標在邊界上變成左右箭頭);
//     點其他地方 → 外框變回原樣,不能再拖
//  2. 雙擊配置長條 → 開啟編輯 / 刪除視窗
//  3. 顯示人力配置時,雙擊「空白處」→ 開啟新增視窗,開始日期帶入滑鼠所在的日期(哪裡算空白處由頁面的 blankArea 決定)
// 長條需要 data-alloc="配置 id",且內含兩個把手 <i class="alloc-h" data-h="l|r">(只有選取中才吃滑鼠事件)。
//
// opts:{
//   canEdit(), findAllocation(id), refresh(anchor),
//   blankArea(e, row): 這次雙擊算不算「可新增配置的空白處」,
//   openEdit(allocation), openAdd(rowId, startDate) }
export function attachAllocationEditor(host, opts) {
  let selectedId = null;
  const barEl = (id) => host.querySelector(`[data-alloc="${CSS.escape(id)}"]`);
  const anchorAt = (x, y) => {
    const tl = host.querySelector('.tl');
    return tl ? captureAnchor(tl, { clientX: x, clientY: y }) : null;
  };

  const select = (id) => {
    if (selectedId) barEl(selectedId)?.classList.remove('is-selected');
    selectedId = id;
    if (id) barEl(id)?.classList.add('is-selected');
  };
  const reapplySelection = () => { if (selectedId) { const el = barEl(selectedId); if (el) el.classList.add('is-selected'); else selectedId = null; } };

  document.addEventListener('pointerdown', (e) => { // 點其他地方 → 取消選取
    if (ALLOC_EDGE_DRAG && selectedId && !e.target.closest?.(`[data-alloc="${CSS.escape(selectedId)}"]`)) select(null);
  });

  host.addEventListener('pointerdown', (e) => {
    if (!ALLOC_EDGE_DRAG || !opts.canEdit() || e.button !== 0) return; // 功能暫時關閉(constants.js 的 ALLOC_EDGE_DRAG)
    const bar = e.target.closest('[data-alloc]');
    if (!bar) return;
    const id = bar.dataset.alloc;
    const handle = e.target.closest('.alloc-h');
    if (id !== selectedId) { select(id); return; } // 第一下只是選取
    if (!handle) return;

    const a = opts.findAllocation(id);
    const tl = host.querySelector('.tl');
    if (!a || !tl) return;
    e.preventDefault();
    const side = handle.dataset.h; // 'l' 或 'r'
    const ppd = Number(tl.dataset.ppd);
    const startIdx = Number(tl.dataset.startIdx);
    const from = dayIndex(a.start_date);
    const to = dayIndex(a.end_date);
    const x0 = e.clientX;
    let nf = from; let nt = to;
    handle.setPointerCapture(e.pointerId);
    bar.classList.add('is-dragging');
    const paint = () => {
      bar.style.left = `${((nf - startIdx) * ppd).toFixed(1)}px`;
      bar.style.width = `${Math.max(4, (nt - nf + 1) * ppd).toFixed(1)}px`;
    };
    const move = (ev) => {
      const d = Math.round((ev.clientX - x0) / ppd);
      if (side === 'l') nf = Math.min(from + d, to); // 開始日期不能晚於結束日期
      else nt = Math.max(to + d, from);              // 結束日期不能早於開始日期
      paint();
    };
    const up = async (ev) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      bar.classList.remove('is-dragging');
      if ((nf === from && nt === to) || ev.type === 'pointercancel') { nf = from; nt = to; paint(); return; }
      const start = ymd(nf); const end = ymd(nt);
      try {
        await updateAllocation(id, { project_id: a.project_id, member_id: a.member_id, start_date: start, end_date: end, percentage: a.percentage });
        a.start_date = start; a.end_date = end;
      } catch (err) { alert(`儲存失敗:${err.message}`); }
      opts.refresh(anchorAt(ev.clientX, ev.clientY));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });

  // 由頁面的 dblclick 先呼叫;回傳 true 代表已處理(頁面不要再切換顯示方式)
  function handleDblClick(e) {
    if (!opts.canEdit()) return false;
    const bar = e.target.closest('[data-alloc]');
    if (bar) {
      const a = opts.findAllocation(bar.dataset.alloc);
      if (a) opts.openEdit(a);
      return true;
    }
    const row = e.target.closest('.tl__row');
    if (row && opts.blankArea(e, row)) {
      const tl = host.querySelector('.tl');
      const track = e.target.closest('.tl__track');
      const idx = Number(tl.dataset.startIdx) + Math.floor((e.clientX - track.getBoundingClientRect().left) / Number(tl.dataset.ppd));
      opts.openAdd(row.dataset.id, ymd(idx));
      return true;
    }
    return false;
  }

  return { handleDblClick, reapplySelection };
}
