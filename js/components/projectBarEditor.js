import { updateProjectDates } from '../api/projects.js';
import { captureAnchor } from './scrollAnchor.js';
import { showConfirmBar } from './confirmBar.js';
import { ymd } from '../utils/date.js';

// 專案總覽:專案長條(外框)的開始 / 結束日期編輯(僅管理員),操作方式仿照人力配置長條(allocationEditor.js):
//  1. 單擊專案長條的外框 → 進入編輯模式:外框閃爍(dimming),左右邊界可拖曳
//     (游標在邊界上變成左右箭頭,邊界上方顯示該邊界的日期;左 = 開始日期、右 = 結束日期)
//  2. 拖曳期間只改畫面,不寫資料庫;調整過日期後,長條旁出現「確定 / 取消」:按「確定」才寫入資料庫
//  3. 編輯模式下再單擊長條、點其他地方、或按「取消」→ 離開編輯模式(有尚未確定的修改就放棄)
// 長條需要 data-pbar="專案 id"、data-pf / data-pt(長條目前的開始 / 結束日期索引),內含兩個把手 <i class="pbar-h" data-h="l|r">。
//
// opts:{ canEdit(), findProject(id), refresh(anchor) }
const EDGE_HIT = 5; // 單擊「外框」的容許範圍(px):距離長條邊緣 5px 內都算點到外框(外框本身只有 2px,太難點)
const nearBorder = (bar, e) => {
  const r = bar.getBoundingClientRect();
  return e.clientX - r.left <= EDGE_HIT || r.right - e.clientX <= EDGE_HIT || e.clientY - r.top <= EDGE_HIT || r.bottom - e.clientY <= EDGE_HIT;
};
export function attachProjectBarEditor(host, opts) {
  let selectedId = null;
  let dragging = false;
  let draft = null; // { id, start, end }:選取前資料庫裡的日期(可能是 null = 由里程碑 / 配置推算)
  let confirm = null;
  let tip = null;
  const barEl = (id) => host.querySelector(`[data-pbar="${CSS.escape(id)}"]`);
  const anchorAt = (x, y) => {
    const tl = host.querySelector('.tl');
    return tl ? captureAnchor(tl, { clientX: x, clientY: y }) : null;
  };

  const showTip = (bar, side, text) => {
    if (!tip) { tip = document.createElement('div'); tip.className = 'edge-tip'; document.body.appendChild(tip); }
    tip.textContent = text;
    const r = bar.getBoundingClientRect();
    const x = side === 'l' ? r.left : r.right;
    tip.style.left = `${Math.round(Math.max(4, Math.min(x - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 4)))}px`;
    tip.style.top = `${Math.round(Math.max(4, r.top - tip.offsetHeight - 6))}px`;
  };
  const hideTip = () => { tip?.remove(); tip = null; };
  const closeConfirm = () => { confirm?.close(); confirm = null; };

  const cancelDraft = (ev) => {
    const d = draft;
    draft = null;
    closeConfirm();
    if (!d) return;
    const p = opts.findProject(d.id);
    if (p) { p.start_date = d.start; p.end_date = d.end; }
    opts.refresh(anchorAt(ev?.clientX, ev?.clientY));
  };
  const commitDraft = async (ev) => {
    const d = draft;
    draft = null;
    closeConfirm();
    if (!d) return;
    const p = opts.findProject(d.id);
    if (!p) return;
    try {
      await updateProjectDates(d.id, p.start_date, p.end_date);
    } catch (err) {
      p.start_date = d.start; p.end_date = d.end;
      alert(`儲存失敗:${err.message}`);
    }
    opts.refresh(anchorAt(ev?.clientX, ev?.clientY));
  };
  const showConfirm = (id) => {
    closeConfirm();
    confirm = showConfirmBar({
      getEl: () => barEl(id),
      onOk: (e) => { commitDraft(e); select(null); },
      onCancel: (e) => { cancelDraft(e); select(null); },
    });
  };
  const select = (id, ev) => {
    if (selectedId) barEl(selectedId)?.classList.remove('is-selected');
    selectedId = id;
    if (id) barEl(id)?.classList.add('is-selected');
    hideTip();
    if (draft && draft.id !== id) cancelDraft(ev);
  };
  const reapplySelection = () => { if (selectedId) { const el = barEl(selectedId); if (el) el.classList.add('is-selected'); else selectedId = null; } };

  window.addEventListener('beforeunload', (e) => { if (draft) { e.preventDefault(); e.returnValue = ''; } });

  // 點其他地方 → 離開編輯模式(含確定 / 取消按鈕以外的任何地方;點長條本身交給 click 處理)
  document.addEventListener('pointerdown', (e) => {
    if (selectedId && !e.target.closest?.(`[data-pbar="${CSS.escape(selectedId)}"]`) && !e.target.closest?.('.cfm')) select(null, e);
  });

  // 單擊外框進入編輯模式;編輯中再單擊長條 → 離開。用 click(不是 pointerdown),拖曳平移後的那一下 click 會被吃掉,不會誤觸
  host.addEventListener('click', (e) => {
    if (!opts.canEdit()) return;
    const bar = e.target.closest('[data-pbar]');
    if (!bar || e.target.closest('.pbar-h')) return;
    const id = bar.dataset.pbar;
    if (id === selectedId) { select(null, e); return; }
    if (e.target !== bar) return; // 點到長條裡面的配置長條 / 里程碑,不算
    if (nearBorder(bar, e)) select(id, e);
  });

  // 滑鼠移到專案長條的外框上 → 游標改成「手伸出食指」(pointer),表示可以按;移開就恢復(長條內部仍是平移用的手掌)
  host.addEventListener('pointermove', (e) => {
    if (!opts.canEdit() || dragging || e.buttons) return;
    const bar = e.target.closest?.('[data-pbar]');
    if (host.__pbarHot && host.__pbarHot !== bar) { host.__pbarHot.style.cursor = ''; host.__pbarHot = null; }
    if (!bar || e.target.closest('.pbar-h') || e.target !== bar) return;
    const hot = nearBorder(bar, e);
    bar.style.cursor = hot ? 'pointer' : '';
    host.__pbarHot = hot ? bar : null;
  });

  host.addEventListener('pointerover', (e) => {
    const h = e.target.closest?.('.pbar-h');
    if (!h || dragging) return;
    const bar = h.closest('[data-pbar]');
    if (bar?.classList.contains('is-selected')) {
      const side = h.dataset.h;
      showTip(bar, side, side === 'l' ? `開始 ${ymd(Number(bar.dataset.pf))}` : `結束 ${ymd(Number(bar.dataset.pt))}`);
    }
  });
  host.addEventListener('pointerout', (e) => { if (!dragging && e.target.closest?.('.pbar-h')) hideTip(); });

  host.addEventListener('pointerdown', (e) => {
    if (!opts.canEdit() || e.button !== 0) return;
    const handle = e.target.closest('.pbar-h');
    if (!handle) return;
    const bar = handle.closest('[data-pbar]');
    const id = bar.dataset.pbar;
    if (id !== selectedId) return; // 沒選取時把手不吃事件(CSS),保險起見再擋一次
    const p = opts.findProject(id);
    const tl = host.querySelector('.tl');
    if (!p || !tl) return;
    e.preventDefault();
    const side = handle.dataset.h;
    const ppd = Number(tl.dataset.ppd);
    const startIdx = Number(tl.dataset.startIdx);
    const from = Number(bar.dataset.pf);
    const to = Number(bar.dataset.pt);
    const x0 = e.clientX;
    let nf = from; let nt = to;
    handle.setPointerCapture(e.pointerId);
    bar.classList.add('is-dragging');
    dragging = true;
    closeConfirm();
    const label = () => (side === 'l' ? `開始 ${ymd(nf)}` : `結束 ${ymd(nt)}`);
    const paint = () => {
      bar.style.left = `${((nf - startIdx) * ppd).toFixed(1)}px`;
      bar.style.width = `${Math.max(6, (nt - nf) * ppd).toFixed(1)}px`;
      showTip(bar, side, label());
    };
    const move = (ev) => {
      const d = Math.round((ev.clientX - x0) / ppd);
      if (side === 'l') nf = Math.min(from + d, to);
      else nt = Math.max(to + d, from);
      paint();
    };
    const up = (ev) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      bar.classList.remove('is-dragging');
      dragging = false;
      hideTip();
      if ((nf === from && nt === to) || ev.type === 'pointercancel') { nf = from; nt = to; paint(); hideTip(); if (draft) showConfirm(id); return; }
      // 只記在本地(畫面已在新位置);長條上顯示的是兩端日期,所以開始、結束日期一起寫入,按「確定」才寫資料庫
      if (!draft) draft = { id, start: p.start_date ?? null, end: p.end_date ?? null };
      p.start_date = ymd(nf); p.end_date = ymd(nt);
      bar.dataset.pf = String(nf); bar.dataset.pt = String(nt);
      showConfirm(id);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
    paint();
  });

  return { reapplySelection };
}
