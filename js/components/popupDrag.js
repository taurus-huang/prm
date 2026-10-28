// 所有 popup 視窗都能用滑鼠拖曳標題列移動位置,避免擋住需要看的資訊。專案總覽與人力資源總覽共用,頁面載入時呼叫一次就好:
//  - 專案 / 成員 / 人力配置的對話框(<dialog class="dlg">):拖曳標題列(.dlg__head)
//  - 里程碑的新增 / 編輯小視窗(.mspop):拖曳最上面的標題文字
// 用 transform: translate 位移(不改原本的定位),所以之後新開的視窗不用另外處理;位置只在這個視窗開著時有效,關掉重開會回到原位。
// 標題列上的按鈕(✕ 關閉等)與輸入欄位不會觸發拖曳;拖曳時會限制標題列不要整個拖出畫面。
const HANDLES = '.dlg__head, .mspop > strong';
const BOX = 'dialog.dlg, .mspop';
const KEEP = 48; // 至少留在畫面內的標題列範圍(px)

export function attachPopupDrag() {
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const handle = e.target.closest?.(HANDLES);
    if (!handle || e.target.closest('button, input, select, textarea, a')) return;
    const box = handle.closest(BOX);
    if (!box) return;
    e.preventDefault(); // 不要選取文字
    const x0 = e.clientX; const y0 = e.clientY;
    const tx0 = Number(box.dataset.tx) || 0;
    const ty0 = Number(box.dataset.ty) || 0;
    const r0 = box.getBoundingClientRect();
    handle.style.cursor = 'move';
    const move = (ev) => {
      let dx = ev.clientX - x0;
      let dy = ev.clientY - y0;
      dx = Math.max(KEEP - r0.right, Math.min(innerWidth - KEEP - r0.left, dx)); // 水平:至少留 KEEP px 在畫面內
      dy = Math.max(-r0.top, Math.min(innerHeight - KEEP - r0.top, dy));        // 垂直:標題列不拖出上緣、至少留 KEEP px 在下緣內
      box.dataset.tx = String(tx0 + dx);
      box.dataset.ty = String(ty0 + dy);
      box.style.transform = `translate(${tx0 + dx}px, ${ty0 + dy}px)`;
    };
    const up = () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      handle.style.cursor = '';
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
  });
}
