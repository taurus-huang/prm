import { createProject, updateProject, deleteProject } from '../api/projects.js';
import { STATUS_ORDER, STATUS_LABELS, TIMELINE_PHASE_ORDER } from '../utils/constants.js';
import { baseStatus } from '../utils/status.js';
import { escapeHtml as esc } from '../utils/escape.js';

// 新增 / 編輯專案的對話框(<dialog>)。
//  - project 為 null → 新增;有值 → 編輯(左下角多一個「刪除專案」,按下後先二次確認)
//  - 欄位:客戶、機種、狀態、開始 / 結束日期、備註,以及里程碑清單(可新增 / 刪除列)
//  - 儲存、刪除成功後呼叫 onDone(),由頁面重新載入資料
//  - 沒有「點背景關閉」,避免誤觸而遺失輸入;按 Esc 或「取消」才會關閉
export function openProjectDialog({ project = null, customers = [], onDone }) {
  const isEdit = !!project;
  const original = (project?.milestones || []).slice().sort((a, b) => String(a.target_date ?? '9999').localeCompare(String(b.target_date ?? '9999')));

  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.innerHTML = `
    <form class="dlg__form" novalidate>
      <header class="dlg__head">
        <h2>${isEdit ? '編輯專案' : '新增專案'}</h2>
        <button type="button" class="dlg__x" data-act="cancel" aria-label="關閉">✕</button>
      </header>
      <div class="dlg__body">
        <div class="dlg__grid">
          <label class="dlg__f"><span>客戶 <b>*</b></span><input name="customer" list="dlg-customers" required maxlength="100" autocomplete="off" placeholder="選擇或輸入客戶" value="${esc(project?.customer ?? '')}"><datalist id="dlg-customers">${customers.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
          <label class="dlg__f"><span>機種 <b>*</b></span><input name="model" required maxlength="100" autocomplete="off" value="${esc(project?.model ?? '')}"></label>
          <label class="dlg__f"><span>專案狀態</span>
            <select name="status">${STATUS_ORDER.map((s) => `<option value="${s}"${(project ? baseStatus(project) : 'BD') === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <span class="dlg__f dlg__f--empty"></span>
          <label class="dlg__f"><span>開始日期</span><input type="date" name="start_date" value="${esc(project?.start_date ?? '')}"></label>
          <label class="dlg__f"><span>結束日期</span><input type="date" name="end_date" value="${esc(project?.end_date ?? '')}"></label>
        </div>
        <label class="dlg__f"><span>備註</span><textarea name="note" rows="2" maxlength="500">${esc(project?.note ?? '')}</textarea></label>

        <fieldset class="dlg__ms">
          <legend>里程碑</legend>
          <div class="dlg__mlist" id="dlg-ms"></div>
          <button type="button" class="btn btn--ghost dlg__add" data-act="add-ms">＋ 新增里程碑</button>
          <datalist id="dlg-phases">${TIMELINE_PHASE_ORDER.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
        </fieldset>
        ${isEdit ? `<p class="dlg__hint">人力配置請在資料庫(allocations)維護;這裡不會更動。</p>` : ''}
      </div>
      <p class="dlg__err" role="alert" hidden></p>
      <footer class="dlg__foot">
        ${isEdit ? '<button type="button" class="btn dlg__del" data-act="ask-delete">刪除專案</button>' : ''}
        <span class="dlg__sp"></span>
        <button type="button" class="btn btn--ghost" data-act="cancel">取消</button>
        <button type="submit" class="btn" data-act="save">${isEdit ? '儲存變更' : '建立專案'}</button>
      </footer>
      ${isEdit ? `
      <div class="dlg__confirm" hidden>
        <p><strong>確定要刪除「${esc(project.customer)} ${esc(project.model)}」嗎?</strong><br>
        這會一併刪除它的 ${original.length} 個里程碑與 ${(project.allocations || []).length} 筆人力配置,且無法復原。</p>
        <div class="dlg__row">
          <button type="button" class="btn btn--ghost" data-act="back">不刪除</button>
          <button type="button" class="btn dlg__del" data-act="delete">確認刪除</button>
        </div>
      </div>` : ''}
    </form>`;
  document.body.appendChild(dlg);

  const $ = (s) => dlg.querySelector(s);
  const form = $('form');
  const errEl = $('.dlg__err');
  const msList = $('#dlg-ms');

  const showErr = (msg) => { errEl.textContent = msg; errEl.hidden = !msg; };
  const close = () => { dlg.close(); dlg.remove(); };

  // ----- 里程碑列 -----
  const addMs = (m = {}) => {
    const row = document.createElement('div');
    row.className = 'dlg__m';
    if (m.id) row.dataset.id = m.id;
    row.innerHTML = `
      <input class="dlg__mphase" list="dlg-phases" placeholder="階段(EVT…)" aria-label="階段" maxlength="30" value="${esc(m.phase ?? '')}">
      <input type="date" class="dlg__mdate" aria-label="目標日期" value="${esc(m.target_date ?? '')}">
      <input class="dlg__mnote" placeholder="備註(選填)" aria-label="備註" maxlength="200" value="${esc(m.note ?? '')}">
      <button type="button" class="dlg__mdel" data-act="del-ms" title="移除這個里程碑" aria-label="移除這個里程碑">✕</button>`;
    msList.appendChild(row);
    return row;
  };
  original.forEach(addMs);
  if (!original.length) { const e = document.createElement('p'); e.className = 'dlg__empty'; e.textContent = '尚無里程碑'; msList.appendChild(e); }
  const syncEmpty = () => {
    const rows = msList.querySelectorAll('.dlg__m').length;
    let e = msList.querySelector('.dlg__empty');
    if (!rows && !e) { e = document.createElement('p'); e.className = 'dlg__empty'; e.textContent = '尚無里程碑'; msList.appendChild(e); }
    if (rows && e) e.remove();
  };

  const readForm = () => {
    const fd = new FormData(form);
    const fields = Object.fromEntries(['customer', 'model', 'status', 'start_date', 'end_date', 'note'].map((k) => [k, fd.get(k)]));
    const milestones = [...msList.querySelectorAll('.dlg__m')].map((r) => ({
      id: r.dataset.id || undefined,
      phase: r.querySelector('.dlg__mphase').value,
      target_date: r.querySelector('.dlg__mdate').value,
      note: r.querySelector('.dlg__mnote').value,
    }));
    return { fields, milestones };
  };

  const validate = ({ fields, milestones }) => {
    if (!fields.customer.trim()) return ['請輸入客戶。', 'customer'];
    if (!fields.model.trim()) return ['請輸入機種。', 'model'];
    if (fields.start_date && fields.end_date && fields.end_date < fields.start_date) return ['結束日期不能早於開始日期。', 'end_date'];
    const bad = milestones.findIndex((m) => !m.phase.trim());
    if (bad >= 0) return [`第 ${bad + 1} 個里程碑缺少階段名稱(不需要的請按 ✕ 移除)。`, null, bad];
    return null;
  };

  const busy = (on) => dlg.querySelectorAll('button, input, select, textarea').forEach((el) => { el.disabled = on; });

  // ----- 操作 -----
  dlg.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'cancel') close();
    else if (act === 'add-ms') { syncEmpty(); addMs().querySelector('input').focus(); syncEmpty(); }
    else if (act === 'del-ms') { e.target.closest('.dlg__m').remove(); syncEmpty(); }
    else if (act === 'ask-delete') { $('.dlg__confirm').hidden = false; $('.dlg__confirm [data-act="back"]').focus(); }
    else if (act === 'back') { $('.dlg__confirm').hidden = true; }
    else if (act === 'delete') {
      busy(true);
      try { await deleteProject(project.id); close(); onDone?.(null); }
      catch (err) { busy(false); $('.dlg__confirm').hidden = true; showErr(`刪除失敗:${err.message}`); }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('');
    const data = readForm();
    const bad = validate(data);
    if (bad) {
      showErr(bad[0]);
      (bad[1] ? form.elements[bad[1]] : msList.querySelectorAll('.dlg__mphase')[bad[2]])?.focus();
      return;
    }
    busy(true);
    try {
      if (isEdit) await updateProject(project.id, data.fields, data.milestones, original);
      else await createProject(data.fields, data.milestones);
      close();
      onDone?.(data.fields.status);
    } catch (err) {
      busy(false);
      showErr(`儲存失敗:${err.message}`);
    }
  });

  dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (!$('.dlg__confirm')?.hidden) $('.dlg__confirm').hidden = true; else close(); }); // Esc:先收起刪除確認,再關閉
  dlg.showModal();
  form.elements.customer.focus();
}
