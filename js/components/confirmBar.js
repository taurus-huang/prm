// 拖曳調整日期後,出現在被編輯物件旁邊的「確定 / 取消」小按鈕列(畫在 <body> 上,position: fixed)。
// 確定 = 真的寫入資料庫;取消(或點其他地方,由呼叫端處理)= 放棄修改。
// getEl():回傳要靠著的元素(每次重新取,重畫後也找得到);onOk(event) / onCancel(event)
// 回傳 { close };捲動、縮放視窗時會跟著元素重新定位,元素不見了就自動關閉。
export function showConfirmBar({ getEl, onOk, onCancel }) {
  const bar = document.createElement('div');
  bar.className = 'cfm';
  bar.innerHTML = '<button type="button" class="btn" data-act="ok">確定</button><button type="button" class="btn btn--ghost" data-act="cancel">取消</button>';
  document.body.appendChild(bar);

  const position = () => {
    const el = getEl();
    if (!el) { close(); return; }
    const r = el.getBoundingClientRect();
    const w = bar.offsetWidth; const h = bar.offsetHeight;
    let left = r.right + 10;                                  // 預設放在右側
    if (left + w > window.innerWidth - 4) left = r.left - w - 10; // 右邊放不下 → 放左側
    left = Math.max(4, Math.min(left, window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(r.top + r.height / 2 - h / 2, window.innerHeight - h - 4));
    bar.style.left = `${Math.round(left)}px`;
    bar.style.top = `${Math.round(top)}px`;
  };
  const close = () => {
    bar.remove();
    window.removeEventListener('resize', position);
    document.removeEventListener('scroll', position, true);
  };
  bar.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    close();
    (act === 'ok' ? onOk : onCancel)?.(e);
  });
  window.addEventListener('resize', position);
  document.addEventListener('scroll', position, true);
  position();
  return { close };
}
