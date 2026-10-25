// 時間軸上的小型編輯元件(畫在 <body> 上,position: fixed,不會被捲動區域裁掉)。

// 在 anchor 元素上方蓋一個輸入框就地修改。Enter / 離開輸入框 = 確認;Esc = 取消。
// opts:{ type: 'text' | 'date', value, list: [建議選項], onCommit(newValue) }
export function inlineEdit(anchor, { type = 'text', value = '', list = [], onCommit }) {
  const r = anchor.getBoundingClientRect();
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.className = 'inl';
  if (type === 'text') input.maxLength = 30;
  const w = Math.max(type === 'date' ? 140 : 90, r.width + 16);
  input.style.width = `${w}px`;
  input.style.left = `${Math.max(4, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 4))}px`;
  input.style.top = `${Math.max(4, r.top + r.height / 2 - 15)}px`;
  document.body.appendChild(input);
  input.focus();
  if (type === 'text') input.select();

  // 下拉備選:一律列出全部選項(瀏覽器內建的 datalist 會依輸入框目前的文字過濾,預填了名稱就只剩一項甚至沒有)
  let menu = null;
  if (list.length) {
    menu = document.createElement('div');
    menu.className = 'inl__menu';
    menu.setAttribute('role', 'listbox');
    menu.style.minWidth = `${w}px`;
    menu.style.left = input.style.left;
    menu.style.top = `${input.getBoundingClientRect().bottom + 2}px`;
    menu.innerHTML = list.map((v) => `<button type="button" role="option" data-v="${String(v).replace(/"/g, '&quot;')}"${v === value ? ' aria-selected="true"' : ''}>${String(v).replace(/</g, '&lt;')}</button>`).join('');
    menu.addEventListener('mousedown', (e) => { // 不讓輸入框失焦,再自己確認
      const b = e.target.closest('[data-v]');
      if (!b) return;
      e.preventDefault();
      input.value = b.dataset.v;
      finish(true);
    });
    document.body.appendChild(menu);
  }

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    input.remove();
    menu?.remove();
    if (commit && v !== '' && v !== String(value)) onCommit(v);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

// 在滑鼠位置跳出「新增 / 編輯里程碑」小視窗:名稱、日期、備註。Enter(在備註以外)= 確認;Esc、取消、點外面 = 放棄。
// 新增與編輯同一個樣式,只差在標題與確認按鈕的字。
// opts:{ title, submitLabel, x, y(視窗座標), phase, date, note, phases: [建議名稱], onCommit({ phase, date, note }) }
export function openMilestoneForm({ title = '新增里程碑', submitLabel = '新增', x, y, phase = '', date = '', note = '', phases = [], onCommit }) {
  const q = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const pop = document.createElement('form');
  pop.className = 'mspop';
  pop.innerHTML = `
    <strong>${q(title)}</strong>
    <label>名稱<input name="phase" list="mspop-phases" maxlength="30" autocomplete="off" placeholder="EVT、DVT…" value="${q(phase)}"></label>
    <label>日期<input type="date" name="date" value="${q(date)}"></label>
    <label>備註<input name="note" maxlength="200" autocomplete="off" placeholder="(選填)" value="${q(note)}"></label>
    <datalist id="mspop-phases">${phases.map((p) => `<option value="${q(p)}">`).join('')}</datalist>
    <p class="mspop__err" hidden></p>
    <div class="mspop__row"><button type="button" class="btn btn--ghost" data-act="cancel">取消</button><button type="submit" class="btn">${q(submitLabel)}</button></div>`;
  document.body.appendChild(pop);
  const w = pop.offsetWidth; const h = pop.offsetHeight;
  pop.style.left = `${Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(y + 12, window.innerHeight - h - 8))}px`;

  const close = () => {
    pop.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const onOutside = (e) => { if (!pop.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  pop.querySelector('[data-act="cancel"]').addEventListener('click', close);
  pop.addEventListener('submit', (e) => {
    e.preventDefault();
    const ph = pop.elements.phase.value.trim();
    const d = pop.elements.date.value;
    const err = pop.querySelector('.mspop__err');
    if (!ph || !d) { err.textContent = !ph ? '請輸入名稱。' : '請選擇日期。'; err.hidden = false; (!ph ? pop.elements.phase : pop.elements.date).focus(); return; }
    close();
    onCommit({ phase: ph, date: d, note: pop.elements.note.value.trim() });
  });
  pop.elements.phase.focus();
  pop.elements.phase.select();
}
