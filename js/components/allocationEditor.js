import { updateAllocation } from '../api/allocations.js';
import { captureAnchor } from './scrollAnchor.js';
import { dayIndex, ymd } from '../utils/date.js';

// 時間軸上的人力配置(allocation)長條編輯(僅管理員),專案總覽與人力資源總覽共用:
//  1. (edgeDrag 為 true 的頁面才有)點一下配置長條 → 外框變色(琥珀色)= 選取,此時可拖曳左右邊界:
//     - 游標在左 / 右邊界上變成左右箭頭,並在邊界上方顯示該邊界的日期(左 = 開始日期、右 = 結束日期)
//     - 拖左邊界只改開始日期(結束日期不動),拖右邊界只改結束日期(開始日期不動);拖曳中上方日期即時跟著變
//     - 拖曳期間只改畫面,不寫資料庫;點其他地方 → 外框變回原樣、不能再拖,這時才把最後的日期一次寫進資料庫
//  2. 雙擊配置長條 → 開啟編輯 / 刪除視窗
//  3. 顯示人力配置時,雙擊「空白處」→ 開啟新增視窗,開始日期帶入滑鼠所在的日期(哪裡算空白處由頁面的 blankArea 決定)
// 長條需要 data-alloc="配置 id",且(edgeDrag 時)內含兩個把手 <i class="alloc-h" data-h="l|r">(只有選取中才吃滑鼠事件)。
//
// opts:{
//   edgeDrag: 是否開啟「選取後拖曳邊界」, canEdit(), findAllocation(id), refresh(anchor),
//   blankArea(e, row): 這次雙擊算不算「可新增配置的空白處」,
//   openEdit(allocation), openAdd(rowId, startDate) }
export function attachAllocationEditor(host, opts) {
  const edgeDrag = opts.edgeDrag === true;
  let selectedId = null;
  const barEl = (id) => host.querySelector(`[data-alloc="${CSS.escape(id)}"]`);
  const anchorAt = (x, y) => {
    const tl = host.querySelector('.tl');
    return tl ? captureAnchor(tl, { clientX: x, clientY: y }) : null;
  };

  // 邊界上方的日期提示(畫在 <body> 上,position: fixed)
  let tip = null;
  const showTip = (bar, side, text) => {
    if (!tip) { tip = document.createElement('div'); tip.className = 'edge-tip'; document.body.appendChild(tip); }
    tip.textContent = text;
    const r = bar.getBoundingClientRect();
    const x = side === 'l' ? r.left : r.right;
    tip.style.left = `${Math.round(Math.max(4, Math.min(x - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 4)))}px`;
    tip.style.top = `${Math.round(Math.max(4, r.top - tip.offsetHeight - 6))}px`;
  };
  const hideTip = () => { tip?.remove(); tip = null; };
  let dragging = false;

  // 拖曳邊界期間只改畫面與本地資料,不寫資料庫;離開選取狀態(點其他地方、或改選別的長條)時才一次寫入
  // draft:{ id, start, end } —— start / end 是選取前資料庫裡的日期
  let draft = null;
  const commitDraft = async (ev) => {
    const d = draft;
    draft = null;
    if (!d) return;
    const a = opts.findAllocation(d.id);
    if (!a) return;
    if (a.start_date === d.start && a.end_date === d.end) return; // 拖回原位 → 不需要寫入
    try {
      await updateAllocation(d.id, { project_id: a.project_id, member_id: a.member_id, start_date: a.start_date, end_date: a.end_date, percentage: a.percentage });
    } catch (err) {
      a.start_date = d.start; a.end_date = d.end;
      alert(`儲存失敗:${err.message}`);
    }
    opts.refresh(anchorAt(ev?.clientX, ev?.clientY));
  };

  const select = (id, ev) => {
    if (selectedId) barEl(selectedId)?.classList.remove('is-selected');
    selectedId = id;
    if (id) barEl(id)?.classList.add('is-selected');
    hideTip();
    if (draft && draft.id !== id) commitDraft(ev); // 離開(或換到別的)長條的選取狀態 → 才寫入資料庫
  };
  const reapplySelection = () => { if (selectedId) { const el = barEl(selectedId); if (el) el.classList.add('is-selected'); else selectedId = null; } };

  if (edgeDrag) {
    window.addEventListener('beforeunload', (e) => { if (draft) { e.preventDefault(); e.returnValue = ''; } }); // 日期尚未存檔就要關頁 / 換頁 → 瀏覽器會先提醒

    document.addEventListener('pointerdown', (e) => { // 點其他地方 → 取消選取(此時才寫資料庫)
      if (selectedId && !e.target.closest?.(`[data-alloc="${CSS.escape(selectedId)}"]`)) select(null, e);
    });

    // 滑鼠移到選取中長條的左 / 右邊界:上方顯示該邊界的日期(拖曳中由 move 更新)
    host.addEventListener('pointerover', (e) => {
      const h = e.target.closest?.('.alloc-h');
      if (!h || dragging) return;
      const bar = h.closest('[data-alloc]');
      const a = opts.findAllocation(bar.dataset.alloc);
      if (a && bar.classList.contains('is-selected')) showTip(bar, h.dataset.h, h.dataset.h === 'l' ? `開始 ${a.start_date}` : `結束 ${a.end_date}`);
    });
    host.addEventListener('pointerout', (e) => { if (!dragging && e.target.closest?.('.alloc-h')) hideTip(); });

    host.addEventListener('pointerdown', (e) => {
      if (!opts.canEdit() || e.button !== 0) return;
      const bar = e.target.closest('[data-alloc]');
      if (!bar) return;
      const id = bar.dataset.alloc;
      const handle = e.target.closest('.alloc-h');
      if (id !== selectedId) { select(id, e); return; } // 第一下只是選取
      if (!handle) return;

      const a0 = opts.findAllocation(id);
      const tl = host.querySelector('.tl');
      if (!a0 || !tl) return;
      e.preventDefault();
      const side = handle.dataset.h; // 'l' = 左邊界(開始日期),'r' = 右邊界(結束日期)
      const ppd = Number(tl.dataset.ppd);
      const startIdx = Number(tl.dataset.startIdx);
      const from = dayIndex(a0.start_date);
      const to = dayIndex(a0.end_date);
      const x0 = e.clientX;
      let nf = from; let nt = to;
      handle.setPointerCapture(e.pointerId);
      bar.classList.add('is-dragging');
      dragging = true;
      const label = () => (side === 'l' ? `開始 ${ymd(nf)}` : `結束 ${ymd(nt)}`);
      const paint = () => {
        bar.style.left = `${((nf - startIdx) * ppd).toFixed(1)}px`;
        bar.style.width = `${Math.max(4, (nt - nf + 1) * ppd).toFixed(1)}px`;
        showTip(bar, side, label()); // 拖曳中,上方日期即時跟著變
      };
      const move = (ev) => {
        const d = Math.round((ev.clientX - x0) / ppd);
        if (side === 'l') nf = Math.min(from + d, to); // 只動左邊界:開始日期不能晚於結束日期,結束日期不動
        else nt = Math.max(to + d, from);              // 只動右邊界:結束日期不能早於開始日期,開始日期不動
        paint();
      };
      const up = (ev) => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        bar.classList.remove('is-dragging');
        dragging = false;
        hideTip();
        if ((nf === from && nt === to) || ev.type === 'pointercancel') { nf = from; nt = to; paint(); hideTip(); return; }
        // 只記在本地(畫面已經在新位置);要等離開選取狀態才寫資料庫
        if (!draft) draft = { id, start: a0.start_date, end: a0.end_date };
        a0.start_date = ymd(nf); a0.end_date = ymd(nt);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
      paint();
    });
  }

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
