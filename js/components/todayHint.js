import { getLabelW } from './timeAxis.js';

// 「今天」提示箭頭:目前看到的畫面範圍不包含今天時,在日期列的最左邊或最右邊顯示紅色箭頭,
// 提示今天在左邊或右邊;點擊箭頭可捲動到今天。專案總覽與人力資源總覽共用。
// tl: 時間軸最外層元素(.tl),需有 data-today-x(今天在軌道上的 x 座標)
export function attachTodayHint(tl) {
  const head = tl.querySelector('.tl__head');
  if (!head) return;
  const todayX = () => Number(tl.dataset.todayX); // 紅線會隨時間慢慢移動(todayLine.js),所以每次都重新讀

  const make = (dir, text, tip) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tl__today-arrow tl__today-arrow--${dir}`;
    b.textContent = text;
    b.title = tip;
    b.hidden = true;
    head.appendChild(b);
    return b;
  };
  const left = make('left', '◀ 今天', '今天在左邊(點擊跳到今天)');
  const right = make('right', '今天 ▶', '今天在右邊(點擊跳到今天)');

  const update = () => {
    const labelW = getLabelW(tl);
    const vis = tl.clientWidth - labelW;           // 可視的軌道寬度(扣掉左側名稱欄)
    const sx = tl.scrollLeft;
    left.hidden = !(todayX() < sx);                // 今天在可視範圍左邊
    right.hidden = !(todayX() > sx + vis);         // 今天在可視範圍右邊
    // 日期列在捲動容器內,座標以整個內容為準:箭頭貼在可視範圍的左緣 / 右緣
    left.style.left = `${sx + labelW + 6}px`;
    if (!right.hidden) right.style.left = `${sx + tl.clientWidth - 6 - right.offsetWidth}px`;
  };

  const jump = () => {
    const vis = tl.clientWidth - getLabelW(tl);
    tl.scrollTo({ left: Math.max(0, todayX() - vis / 2), behavior: 'smooth' }); // 今天落在可視區(扣掉名稱欄)的正中間
  };
  left.addEventListener('click', jump);
  right.addEventListener('click', jump);

  tl.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(tl); // 視窗大小改變時重新判斷
  tl.addEventListener('labelwidth', update); // 名稱欄寬度改變時重新判斷
  tl.addEventListener('todaymove', update);  // 紅線隨時間移動(或跨日)時重新判斷
  update();
}
