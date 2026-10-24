import { updateMilestone, createMilestone } from '../api/milestones.js';
import { inlineEdit, openMilestoneAdd } from './inlineEdit.js';
import { captureAnchor } from './scrollAnchor.js';
import { dayIndex, ymd } from '../utils/date.js';
import { mmdd } from './timeAxis.js';
import { TIMELINE_PHASE_ORDER } from '../utils/constants.js';

// 專案總覽時間軸上的里程碑編輯(僅管理員):
//  1. 雙擊里程碑名稱 → 就地修改名稱
//  2. 雙擊里程碑日期 → 就地修改日期
//  3. 雙擊菱形 → 變色(琥珀色)= 進入編輯模式,可以左右拖曳改日期(以天為單位);點其他地方 → 取消選取
//  4. 專案長條內沒有顯示人力配置時,雙擊長條內的空白處 → 在該日期新增里程碑
// 資料直接改在頁面的 projects 陣列上,再請頁面重畫(refresh),並保持畫面位置。
//
// host:時間軸容器;opts:{
//   canEdit(): 是否為管理員, projects(): 專案陣列,
//   allocShown(projectId): 該專案目前是否顯示人力配置,
//   refresh(anchor): 重畫(anchor 為 captureAnchor 的結果,可為 null) }
export function attachMilestoneEditor(host, opts) {
  let selectedId = null;

  const msEl = (id) => host.querySelector(`.tl__ms[data-ms-id="${CSS.escape(id)}"]`);
  const find = (id) => {
    for (const p of opts.projects()) {
      const m = (p.milestones || []).find((x) => x.id === id);
      if (m) return { project: p, milestone: m };
    }
    return null;
  };
  const anchorAt = (x, y) => {
    const tl = host.querySelector('.tl');
    return tl ? captureAnchor(tl, { clientX: x, clientY: y }) : null;
  };

  const select = (id) => {
    if (selectedId) msEl(selectedId)?.classList.remove('is-selected');
    selectedId = id;
    if (id) msEl(id)?.classList.add('is-selected');
  };
  // 重畫之後,把選取狀態套回去
  const reapplySelection = () => { if (selectedId) { const el = msEl(selectedId); if (el) el.classList.add('is-selected'); else selectedId = null; } };

  const save = async (apply, write, ev) => { // 先寫資料庫,成功才改本地資料並重畫;失敗就提示並維持原狀
    try { await write(); apply(); }
    catch (err) { alert(`儲存失敗:${err.message}`); }
    opts.refresh(anchorAt(ev.clientX, ev.clientY));
  };

  // ----- 選取與拖曳 -----
  document.addEventListener('pointerdown', (e) => { // 點其他地方 → 取消選取
    if (selectedId && !e.target.closest?.(`.tl__ms[data-ms-id="${CSS.escape(selectedId)}"] i`)) select(null);
  });
  host.addEventListener('pointerdown', (e) => {
    if (!opts.canEdit() || e.button !== 0) return;
    const dia = e.target.closest('.tl__ms i');
    const ms = dia?.closest('.tl__ms');
    if (!ms) return;
    const id = ms.dataset.msId;
    if (id !== selectedId) return; // 還沒進入編輯模式(要先雙擊菱形)→ 不能拖

    const found = find(id);
    const tl = host.querySelector('.tl');
    if (!found || !tl) return;
    e.preventDefault();
    const ppd = Number(tl.dataset.ppd);
    const startIdx = Number(tl.dataset.startIdx);
    const from = dayIndex(found.milestone.target_date);
    const x0 = e.clientX;
    const dateEl = ms.querySelector('.tl__md');
    let to = from;
    dia.setPointerCapture(e.pointerId);
    ms.classList.add('is-dragging');
    const move = (ev) => {
      to = from + Math.round((ev.clientX - x0) / ppd);
      ms.style.left = `${((to - startIdx) * ppd).toFixed(1)}px`;
      if (dateEl) dateEl.textContent = mmdd(to);
    };
    const up = (ev) => {
      dia.removeEventListener('pointermove', move);
      dia.removeEventListener('pointerup', up);
      dia.removeEventListener('pointercancel', up);
      ms.classList.remove('is-dragging');
      if (to === from || ev.type === 'pointercancel') { ms.style.left = `${((from - startIdx) * ppd).toFixed(1)}px`; if (dateEl) dateEl.textContent = mmdd(from); return; }
      const date = ymd(to);
      save(() => { found.milestone.target_date = date; }, () => updateMilestone(id, { target_date: date }), ev);
    };
    dia.addEventListener('pointermove', move);
    dia.addEventListener('pointerup', up);
    dia.addEventListener('pointercancel', up);
  });

  // ----- 雙擊(由頁面的 dblclick 先呼叫;回傳 true 代表已處理,頁面不要再做別的) -----
  function handleDblClick(e) {
    if (!opts.canEdit()) return false;
    const ms = e.target.closest('.tl__ms');
    if (ms) {
      const found = find(ms.dataset.msId);
      if (!found) return true;
      const { milestone: m } = found;
      if (e.target.closest('.tl__mn')) { // 修改名稱
        inlineEdit(e.target.closest('.tl__mn'), {
          value: String(m.phase ?? ''), list: TIMELINE_PHASE_ORDER, // 名稱建議只列標準階段
          onCommit: (v) => save(() => { m.phase = v; }, () => updateMilestone(m.id, { phase: v }), e),
        });
      } else if (e.target.closest('.tl__md')) { // 修改日期
        inlineEdit(e.target.closest('.tl__md'), {
          type: 'date', value: m.target_date,
          onCommit: (v) => save(() => { m.target_date = v; }, () => updateMilestone(m.id, { target_date: v }), e),
        });
      }
      else if (e.target.closest('i')) select(ms.dataset.msId); // 雙擊菱形 → 進入編輯模式(變色,可左右拖曳)
      return true; // 在里程碑上雙擊,一律不切換人力配置顯示
    }
    const bar = e.target.closest('.tl__bar');
    const row = e.target.closest('.tl__row');
    if (bar && row && !opts.allocShown(row.dataset.id)) { // 長條內沒有顯示人力配置 → 新增里程碑
      const tl = host.querySelector('.tl');
      const track = e.target.closest('.tl__track');
      const idx = Number(tl.dataset.startIdx) + Math.floor((e.clientX - track.getBoundingClientRect().left) / Number(tl.dataset.ppd));
      const project = opts.projects().find((p) => p.id === row.dataset.id);
      if (!project) return true;
      openMilestoneAdd({
        x: e.clientX, y: e.clientY, date: ymd(idx), phases: TIMELINE_PHASE_ORDER, // 名稱建議只列標準階段
        onCommit: async ({ phase, date }) => {
          try {
            const created = await createMilestone(project.id, phase, date);
            (project.milestones ||= []).push(created);
            select(created.id);
          } catch (err) { alert(`新增失敗:${err.message}`); }
          opts.refresh(anchorAt(e.clientX, e.clientY));
        },
      });
      return true;
    }
    return false;
  }

  return { handleDblClick, reapplySelection };
}
