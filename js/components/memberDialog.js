import { createMember, updateMember, deleteMember } from '../api/members.js';
import { escapeHtml as esc } from '../utils/escape.js';

// 新增 / 編輯成員的對話框(<dialog>),樣式與專案的對話框共用(css/dialog.css)。
//  - member 為 null → 新增;有值 → 編輯(左下角多一個「刪除成員」,按下後先二次確認)
//  - 欄位:姓名(必填)、職務、工號、分機、Email、職級、職稱
//  - 儲存、刪除成功後呼叫 onDone(),由頁面重新載入資料
//  - 沒有「點背景關閉」,避免誤觸而遺失輸入;按 Esc 或「取消」才會關閉
// roles:目前已有的職務名稱,供職務欄位下拉建議
export function openMemberDialog({ member = null, roles = [], onDone }) {
  const isEdit = !!member;
  const allocCount = (member?.allocations || []).length;

  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.innerHTML = `
    <form class="dlg__form" novalidate>
      <header class="dlg__head">
        <h2>${isEdit ? '編輯成員' : '新增成員'}</h2>
        <button type="button" class="dlg__x" data-act="cancel" aria-label="關閉">✕</button>
      </header>
      <div class="dlg__body">
        <div class="dlg__grid">
          <label class="dlg__f"><span>姓名 <b>*</b></span><input name="name" required maxlength="100" autocomplete="off" value="${esc(member?.name ?? '')}"></label>
          <label class="dlg__f"><span>職務</span><input name="role" list="dlg-roles" maxlength="30" autocomplete="off" placeholder="FW、QA、PM…" value="${esc(member?.role ?? '')}"></label>
          <label class="dlg__f"><span>工號</span><input name="employee_id" maxlength="8" autocomplete="off" value="${esc(member?.employee_id ?? '')}"></label>
          <label class="dlg__f"><span>分機</span><input name="extension" maxlength="5" autocomplete="off" inputmode="numeric" value="${esc(member?.extension ?? '')}"></label>
          <label class="dlg__f dlg__f--wide"><span>Email</span><input type="email" name="email" maxlength="200" autocomplete="off" value="${esc(member?.email ?? '')}"></label>
          <label class="dlg__f"><span>職級</span><input type="number" name="job_grade" min="0" step="1" value="${esc(member?.job_grade ?? '')}"></label>
          <label class="dlg__f"><span>職稱</span><input name="job_title" maxlength="50" autocomplete="off" value="${esc(member?.job_title ?? '')}"></label>
        </div>
        <datalist id="dlg-roles">${roles.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
        ${isEdit ? `<p class="dlg__hint">人力配置請在資料庫(allocations)維護;這裡不會更動。</p>` : ''}
      </div>
      <p class="dlg__err" role="alert" hidden></p>
      <footer class="dlg__foot">
        ${isEdit ? '<button type="button" class="btn dlg__del" data-act="ask-delete">刪除成員</button>' : ''}
        <span class="dlg__sp"></span>
        <button type="button" class="btn btn--ghost" data-act="cancel">取消</button>
        <button type="submit" class="btn" data-act="save">${isEdit ? '儲存變更' : '建立成員'}</button>
      </footer>
      ${isEdit ? `
      <div class="dlg__confirm" hidden>
        <p><strong>確定要刪除成員「${esc(member.name)}」嗎?</strong><br>
        這會一併刪除他的 ${allocCount} 筆人力配置,且無法復原。</p>
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
  const showErr = (msg) => { errEl.textContent = msg; errEl.hidden = !msg; };
  const close = () => { dlg.close(); dlg.remove(); };
  const busy = (on) => dlg.querySelectorAll('button, input, select, textarea').forEach((el) => { el.disabled = on; });

  const readForm = () => {
    const fd = new FormData(form);
    return Object.fromEntries(['name', 'role', 'employee_id', 'extension', 'email', 'job_grade', 'job_title'].map((k) => [k, String(fd.get(k) ?? '')]));
  };

  const validate = (f) => {
    if (!f.name.trim()) return ['請輸入姓名。', 'name'];
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return ['Email 格式不正確。', 'email'];
    if (f.extension.trim() && !/^\d+$/.test(f.extension.trim())) return ['分機只能填數字。', 'extension'];
    if (f.job_grade.trim() && !/^\d+$/.test(f.job_grade.trim())) return ['職級請填整數。', 'job_grade'];
    return null;
  };

  dlg.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'cancel') close();
    else if (act === 'ask-delete') { $('.dlg__confirm').hidden = false; $('.dlg__confirm [data-act="back"]').focus(); }
    else if (act === 'back') { $('.dlg__confirm').hidden = true; }
    else if (act === 'delete') {
      busy(true);
      try { await deleteMember(member.id); close(); onDone?.(null); }
      catch (err) { busy(false); $('.dlg__confirm').hidden = true; showErr(`刪除失敗:${err.message}`); }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('');
    const f = readForm();
    const bad = validate(f);
    if (bad) { showErr(bad[0]); form.elements[bad[1]]?.focus(); return; }
    busy(true);
    try {
      if (isEdit) await updateMember(member.id, f);
      else await createMember(f);
      close();
      onDone?.(f.role.trim() || null);
    } catch (err) {
      busy(false);
      showErr(`儲存失敗:${err.message}`);
    }
  });

  dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (!$('.dlg__confirm')?.hidden) $('.dlg__confirm').hidden = true; else close(); }); // Esc:先收起刪除確認,再關閉
  dlg.showModal();
  form.elements.name.focus();
}
