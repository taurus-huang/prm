// 可下拉選擇、也可自行輸入的 combobox(取代瀏覽器內建的 datalist:datalist 的箭頭只在滑鼠移上去才出現,
// 下拉清單的位置、寬度也不能控制)。
//  - 輸入框右邊永遠有 ▾ 按鈕;按它或點輸入框 → 展開清單,清單位置與寬度都對齊這個 combobox
//  - 清單永遠列出 getOptions() 回傳的全部選項(不會依輸入框裡已有的字再縮小),第一項「(全部)」= 清除篩選
//  - 選到項目 → 填入輸入框並觸發 input 事件(頁面照原本監聽 input 即可);Esc / 點其他地方 / Tab 離開 → 收起
//  - 鍵盤:↑ ↓ 移動、Enter 選取
// 用法:attachCombobox(inputEl, { getOptions: () => ['A', 'B'] }) —— 每次展開時才呼叫 getOptions,所以選項可以隨其他條件變動
export function attachCombobox(input, { getOptions, allLabel = '(全部)' }) {
  const wrap = document.createElement('span');
  wrap.className = 'cb';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.classList.add('cb__input');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cb__btn';
  btn.tabIndex = -1;
  btn.setAttribute('aria-label', '展開選單');
  btn.textContent = '▾';
  wrap.appendChild(btn);

  const list = document.createElement('ul');
  list.className = 'cb__list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.appendChild(list);

  let items = [];
  let active = -1;
  const isOpen = () => !list.hidden;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const setActive = (i) => {
    active = Math.max(-1, Math.min(i, items.length - 1));
    [...list.children].forEach((li, k) => li.classList.toggle('is-active', k === active));
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (value) => {
    input.value = value;
    close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const open = () => {
    items = getOptions();
    const cur = input.value.trim();
    list.innerHTML = '';
    const mk = (text, value, selected) => {
      const li = document.createElement('li');
      li.className = `cb__opt${selected ? ' is-selected' : ''}`;
      li.setAttribute('role', 'option');
      li.textContent = text;
      li.dataset.value = value;
      list.appendChild(li);
    };
    mk(allLabel, '', cur === '');
    items.forEach((v) => mk(v, v, v === cur));
    items = ['', ...items];
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(items.indexOf(cur));
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  };

  btn.addEventListener('mousedown', (e) => e.preventDefault()); // 不要搶走輸入框的焦點
  btn.addEventListener('click', () => { if (isOpen()) close(); else { input.focus(); open(); } });
  input.addEventListener('click', () => { if (!isOpen()) open(); });
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.cb__opt');
    if (li) choose(li.dataset.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen()) { open(); return; }
      setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter' && isOpen() && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') close();
  });
  document.addEventListener('pointerdown', (e) => { if (isOpen() && !wrap.contains(e.target)) close(); });
  return { close };
}
