import { createAllocation, updateAllocation, deleteAllocation } from '../api/allocations.js';
import { getMembers } from '../api/members.js';
import { getProjects } from '../api/projects.js';
import { LOAD_THRESHOLDS } from '../utils/constants.js';
import { escapeHtml as esc } from '../utils/escape.js';

// 新增 / 編輯「專案成員配置」(allocations)的對話框,專案總覽與人力資源總覽共用。
//  - allocation 為 null → 新增;有值 → 編輯(左下角多一個「刪除配置」,按下後先二次確認)
//  - projectId:從專案那一列進來 → 專案固定(只顯示、不能改),成員用下拉選
//  - memberId :從成員那一列進來 → 成員固定,專案用下拉選
//  - 欄位:專案、成員、開始 / 結束日期、投入比例(0~100%,數字與滑桿連動)
//  - 下方即時提示「該成員在這段期間的合計負荷」,超過 LOAD_THRESHOLDS.high 時以警示色顯示(只提醒,不阻擋儲存)
//  - 儲存、刪除成功後呼叫 onDone({ projectId, memberId }),由頁面重新載入資料
//  - 沒有「點背景關閉」,避免誤觸而遺失輸入;按 Esc 或「取消」才會關閉
export async function openAllocationDialog({ allocation = null, projectId = null, memberId = null, startDate = null, onDone }) {
  let members; let projects;
  try {
    [members, projects] = await Promise.all([getMembers(), getProjects()]); // 取得最新資料,負荷提示才準確
  } catch (err) { alert(`載入資料失敗:${err.message}`); return; }

  const isEdit = !!allocation;
  const lockProject = projectId ?? null;
  const lockMember = memberId ?? null;
  members = members.slice().sort((a, b) => a.name.localeCompare(b.name));
  projects = projects.slice().sort((a, b) => `${a.customer} ${a.model}`.localeCompare(`${b.customer} ${b.model}`));
  const projName = (p) => `${p.customer} ${p.model}`.trim();
  const memName = (m) => (m.role ? `${m.name}(${m.role})` : m.name);
  const today = new Date().toISOString().slice(0, 10);

  const initProject = allocation?.project_id ?? lockProject ?? '';
  const initMember = allocation?.member_id ?? lockMember ?? '';
  const proj0 = projects.find((p) => p.id === initProject);
  // startDate:從時間軸空白處雙擊進來時,開始日期帶入點到的日期;結束日期帶入專案結束日(不早於開始日才用),否則同一天
  const startInit = allocation?.start_date ?? startDate ?? proj0?.start_date ?? today;
  const endInit = allocation?.end_date ?? (startDate ? (proj0?.end_date && proj0.end_date >= startDate ? proj0.end_date : startDate) : (proj0?.end_date ?? startInit));
  const pctInit = allocation?.percentage ?? 100;

  const fixedBox = (label, text) => `<div class="dlg__f"><span>${label}</span><div class="dlg__fixed">${esc(text)}</div></div>`;
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.innerHTML = `
    <form class="dlg__form" novalidate>
      <header class="dlg__head">
        <h2>${isEdit ? '編輯專案成員配置' : '新增專案成員配置'}</h2>
        <button type="button" class="dlg__x" data-act="cancel" aria-label="關閉">✕</button>
      </header>
      <div class="dlg__body">
        <div class="dlg__grid">
          ${lockProject
            ? fixedBox('專案', projName(projects.find((p) => p.id === lockProject) ?? {}))
            : `<label class="dlg__f"><span>專案 <b>*</b></span><select name="project_id"><option value="">請選擇專案…</option>${projects.map((p) => `<option value="${esc(p.id)}"${p.id === initProject ? ' selected' : ''}>${esc(projName(p))}</option>`).join('')}</select></label>`}
          ${lockMember
            ? fixedBox('成員', memName(members.find((m) => m.id === lockMember) ?? { name: '' }))
            : `<label class="dlg__f"><span>成員 <b>*</b></span><select name="member_id"><option value="">請選擇成員…</option>${members.map((m) => `<option value="${esc(m.id)}"${m.id === initMember ? ' selected' : ''}>${esc(memName(m))}</option>`).join('')}</select></label>`}
          <label class="dlg__f"><span>開始日期 <b>*</b></span><input type="date" name="start_date" value="${esc(startInit)}"></label>
          <label class="dlg__f"><span>結束日期 <b>*</b></span><input type="date" name="end_date" value="${esc(endInit)}"></label>
        </div>
        <div class="dlg__f">
          <span>投入比例 <b>*</b></span>
          <div class="dlg__pct">
            <input type="range" name="pct_range" min="0" max="100" step="5" value="${esc(pctInit)}" aria-label="投入比例滑桿">
            <input type="number" name="percentage" min="0" max="100" step="1" value="${esc(pctInit)}" aria-label="投入比例">
            <span>%</span>
          </div>
        </div>
        <p class="dlg__load" aria-live="polite"></p>
      </div>
      <p class="dlg__err" role="alert" hidden></p>
      <footer class="dlg__foot">
        ${isEdit ? '<button type="button" class="btn dlg__del" data-act="ask-delete">刪除配置</button>' : ''}
        <span class="dlg__sp"></span>
        <button type="button" class="btn btn--ghost" data-act="cancel">取消</button>
        <button type="submit" class="btn" data-act="save">${isEdit ? '儲存變更' : '建立配置'}</button>
      </footer>
      ${isEdit ? `
      <div class="dlg__confirm" hidden>
        <p><strong>確定要刪除這筆配置嗎?</strong><br>
        ${esc(allocation.members?.name ?? '')} 在「${esc(projName(proj0 ?? {}))}」${esc(allocation.start_date)} ~ ${esc(allocation.end_date)}、${esc(allocation.percentage)}%,刪除後無法復原。</p>
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
  const loadEl = $('.dlg__load');
  const showErr = (msg) => { errEl.textContent = msg; errEl.hidden = !msg; };
  const close = () => { dlg.close(); dlg.remove(); };
  const busy = (on) => dlg.querySelectorAll('button, input, select, textarea').forEach((el) => { el.disabled = on; });

  const read = () => {
    const fd = new FormData(form);
    return {
      project_id: lockProject ?? String(fd.get('project_id') ?? ''),
      member_id: lockMember ?? String(fd.get('member_id') ?? ''),
      start_date: String(fd.get('start_date') ?? ''),
      end_date: String(fd.get('end_date') ?? ''),
      percentage: String(fd.get('percentage') ?? '').trim(),
    };
  };

  // 即時負荷提示:該成員在 [start, end] 期間,其他配置的同時投入最高值,以及加上本筆之後的最高值
  const peak = (items, s, e) => {
    const pts = [s, ...items.map((it) => it.start_date).filter((d) => d > s && d <= e)];
    return Math.max(0, ...pts.map((t) => items.filter((it) => it.start_date <= t && it.end_date >= t).reduce((a, it) => a + (Number(it.percentage) || 0), 0)));
  };
  const updateLoad = () => {
    const f = read();
    const m = members.find((x) => x.id === f.member_id);
    const pct = Number(f.percentage);
    loadEl.className = 'dlg__load';
    if (!m || !f.start_date || !f.end_date || f.end_date < f.start_date || f.percentage === '' || Number.isNaN(pct)) { loadEl.textContent = ''; return; }
    const others = (m.allocations || []).filter((a) => a.id !== allocation?.id && a.start_date && a.end_date && a.start_date <= f.end_date && a.end_date >= f.start_date);
    const before = peak(others, f.start_date, f.end_date);
    const after = peak([...others, { start_date: f.start_date, end_date: f.end_date, percentage: pct }], f.start_date, f.end_date);
    const over = after > LOAD_THRESHOLDS.high;
    loadEl.classList.toggle('dlg__load--warn', over);
    loadEl.textContent = `${m.name} 在這段期間:其他專案最高同時投入 ${before}%,加上本筆後最高 ${after}%${over ? `(超過 ${LOAD_THRESHOLDS.high}%,請確認是否超載)` : ''}`;
  };

  // 滑桿與數字連動
  const num = form.elements.percentage;
  const range = form.elements.pct_range;
  range.addEventListener('input', () => { num.value = range.value; updateLoad(); });
  num.addEventListener('input', () => { if (num.value !== '' && !Number.isNaN(Number(num.value))) range.value = Math.max(0, Math.min(100, Number(num.value))); updateLoad(); });

  // 新增時:換專案 → 若日期還沒被手動改過,自動帶入該專案的開始 / 結束日期
  let datesTouched = isEdit || !!startDate;
  form.elements.start_date.addEventListener('input', () => { datesTouched = true; });
  form.elements.end_date.addEventListener('input', () => { datesTouched = true; });
  form.elements.project_id?.addEventListener('change', (e) => {
    const p = projects.find((x) => x.id === e.target.value);
    if (p && !datesTouched) {
      form.elements.start_date.value = p.start_date ?? today;
      form.elements.end_date.value = p.end_date ?? form.elements.start_date.value;
    }
    updateLoad();
  });
  form.addEventListener('change', updateLoad);
  form.addEventListener('input', (e) => { if (e.target.type === 'date') updateLoad(); });

  const validate = (f) => {
    if (!f.project_id) return ['請選擇專案。', 'project_id'];
    if (!f.member_id) return ['請選擇成員。', 'member_id'];
    if (!f.start_date) return ['請輸入開始日期。', 'start_date'];
    if (!f.end_date) return ['請輸入結束日期。', 'end_date'];
    if (f.end_date < f.start_date) return ['結束日期不能早於開始日期。', 'end_date'];
    if (!/^\d+$/.test(f.percentage) || Number(f.percentage) > 100) return ['投入比例請填 0 ~ 100 的整數。', 'percentage'];
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
      try { await deleteAllocation(allocation.id); close(); onDone?.({ projectId: allocation.project_id, memberId: allocation.member_id }); }
      catch (err) { busy(false); $('.dlg__confirm').hidden = true; showErr(`刪除失敗:${err.message}`); }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('');
    const f = read();
    const bad = validate(f);
    if (bad) { showErr(bad[0]); form.elements[bad[1]]?.focus(); return; }
    busy(true);
    try {
      if (isEdit) await updateAllocation(allocation.id, f);
      else await createAllocation(f);
      close();
      onDone?.({ projectId: f.project_id, memberId: f.member_id });
    } catch (err) {
      busy(false);
      showErr(`儲存失敗:${err.message}`);
    }
  });

  dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (!$('.dlg__confirm')?.hidden) $('.dlg__confirm').hidden = true; else close(); }); // Esc:先收起刪除確認,再關閉
  dlg.showModal();
  updateLoad();
  (form.elements.project_id ?? form.elements.member_id ?? form.elements.start_date).focus();
}
