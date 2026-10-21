import { LABEL_W, getLabelW, setLabelW, clampLabelW } from './timeAxis.js';

// 左側名稱欄(「專案」/「成員」)的寬度可以用滑鼠拖曳調整。專案總覽與人力資源總覽共用。
//   拖曳標題格右緣的把手(游標變成 ↔);雙擊把手還原預設寬度;把手取得焦點後可用 ← → 微調(Shift 加大幅度)
// onChange(w):調整完成後呼叫(拖曳放開、雙擊、按鍵),讓頁面把寬度記起來
export function attachColumnResize(tl, { onChange }) {
  const handle = tl.querySelector('.tl__resize');
  if (!handle) return;

  // 之前記住的寬度若超過目前視窗容納得下的範圍,收進合理範圍
  const stored = getLabelW(tl);
  const fitted = clampLabelW(tl, stored);
  if (fitted !== stored) setLabelW(tl, fitted);

  let startX = 0;
  let startW = 0;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // 不要選取到文字
    startX = e.clientX;
    startW = getLabelW(tl);
    handle.setPointerCapture(e.pointerId); // 滑鼠移出把手也持續追蹤
    tl.classList.add('tl--resizing');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    setLabelW(tl, startW + e.clientX - startX);
  });
  const finish = (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    tl.classList.remove('tl--resizing');
    onChange(getLabelW(tl));
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);

  handle.addEventListener('dblclick', () => onChange(setLabelW(tl, LABEL_W)));
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.shiftKey ? 40 : 10;
    onChange(setLabelW(tl, getLabelW(tl) + (e.key === 'ArrowRight' ? step : -step)));
  });
}
