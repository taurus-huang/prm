// 在時間軸區域按住滑鼠左鍵拖曳,就能上下左右移動可視範圍(像拖曳地圖)。專案總覽與人力資源總覽共用。
//  - 只用滑鼠(觸控裝置本來就能用手指捲動)
//  - 日期列、專案(成員)名稱欄不能拖曳
//  - 從按鈕、輸入框、配置長條、里程碑、欄寬把手等「有自己功能」的元素開始按,不會變成拖曳
//  - 移動超過 4px 才算拖曳,所以單擊、雙擊照常運作;拖曳結束後不會誤觸發那一下 click
//  - 時間軸自己有捲軸就捲它;窄螢幕時時間軸沒有捲軸,垂直方向改捲整個網頁
const SKIP = '.tl__head, .tl__label, button, input, select, textarea, a, .tl__resize, .tl__today-arrow, [data-alloc], .tl__ms, .alloc-h, .pbar-h';
const THRESHOLD = 4;

export function attachDragPan(host) {
  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const tl = e.target.closest('.tl');
    if (!tl || e.target.closest(SKIP)) return;

    const x0 = e.clientX; const y0 = e.clientY;
    let lastX = x0; let lastY = y0;
    let panning = false;

    const move = (ev) => {
      if (!panning) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < THRESHOLD) return;
        panning = true;
        tl.classList.add('is-panning');
        window.getSelection()?.removeAllRanges();
      }
      const dx = ev.clientX - lastX; const dy = ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;
      tl.scrollLeft -= dx;
      if (tl.scrollHeight > tl.clientHeight + 1) tl.scrollTop -= dy;
      else window.scrollBy(0, -dy);
    };
    const up = () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      if (panning) {
        tl.classList.remove('is-panning');
        const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener('click', swallow, { capture: true, once: true }); // 拖曳放開後瀏覽器會補一個 click,吃掉它
        setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      }
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
  });
}
