// 名稱欄每一列右上角「⋮」按鈕的下拉選單(僅管理員)。
// 選單畫在 <body> 上(position: fixed),不會被時間軸的捲動區域裁掉;
// 點選單外面、按 Esc、捲動或縮放視窗都會關閉。
// items:[{ label, onClick }]
let current = null;

export function closeRowMenu() {
  if (!current) return;
  current.menu.remove();
  current.btn.setAttribute('aria-expanded', 'false');
  current.btn.classList.remove('is-open');
  document.removeEventListener('pointerdown', current.onOutside, true);
  document.removeEventListener('keydown', current.onKey, true);
  window.removeEventListener('resize', closeRowMenu);
  document.removeEventListener('scroll', closeRowMenu, true);
  current = null;
}

export function openRowMenu(btn, items) {
  const wasOpenOnSame = current?.btn === btn;
  closeRowMenu();
  if (wasOpenOnSame) return; // 再按一次 = 收起

  const menu = document.createElement('div');
  menu.className = 'rowmenu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map((it, i) => `<button type="button" role="menuitem" data-i="${i}">${it.label}</button>`).join('');
  document.body.appendChild(menu);

  const r = btn.getBoundingClientRect();
  const w = menu.offsetWidth;
  menu.style.top = `${Math.round(r.bottom + 4)}px`;
  menu.style.left = `${Math.round(Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)))}px`;

  const onOutside = (e) => { if (!menu.contains(e.target) && e.target !== btn) closeRowMenu(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeRowMenu(); btn.focus(); } };
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    closeRowMenu();
    items[Number(b.dataset.i)].onClick();
  });
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', closeRowMenu);
  document.addEventListener('scroll', closeRowMenu, true);

  btn.setAttribute('aria-expanded', 'true');
  btn.classList.add('is-open');
  current = { menu, btn, onOutside, onKey };
  menu.querySelector('button')?.focus();
}
