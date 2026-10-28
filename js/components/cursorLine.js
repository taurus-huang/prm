import { ymd } from '../utils/date.js';
import { getLabelW } from './timeAxis.js';

// 滑鼠在時間軸區域(不含第一列的日期列與第一欄的名稱欄)移動時,依滑鼠位置畫一條淡淡的 1px 縱線,
// 並在第一列(日期列)顯示這條線對應的日期。專案總覽與人力資源總覽共用,對整個時間軸容器掛一次就好
// (時間軸重畫後會自動重建線與日期標籤)。線不吃滑鼠事件,不影響任何點擊、拖曳。
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const weekdayOf = (idx) => (((idx + 4) % 7) + 7) % 7;

export function attachCursorLine(host) {
  let last = null; // 最後一次滑鼠位置 { x, y }(視窗座標);捲動時用它重新定位

  const hide = () => {
    host.querySelector('.tl__cursor')?.remove();
    host.querySelector('.tl__cursor-date')?.remove();
  };

  const update = () => {
    const tl = host.querySelector('.tl');
    const overlay = tl?.querySelector('.tl__overlay');
    const axis = tl?.querySelector('.tl__axis');
    const head = tl?.querySelector('.tl__head');
    if (!last || !tl || !overlay || !axis || !head) { hide(); return; }
    const r = tl.getBoundingClientRect();
    const labelW = getLabelW(tl);
    const left = r.left + tl.clientLeft + labelW;                 // 可視軌道的左緣(名稱欄右邊)
    const right = r.left + tl.clientLeft + tl.clientWidth;        // 右緣(不含捲軸)
    const top = head.getBoundingClientRect().bottom;              // 日期列下緣
    const bottom = r.top + tl.clientTop + tl.clientHeight;        // 下緣(不含捲軸)
    if (last.x < left || last.x > right || last.y < top || last.y > bottom) { hide(); return; }

    const x = last.x - overlay.getBoundingClientRect().left;      // 在軌道上的 x 座標
    const idx = Math.floor(Number(tl.dataset.startIdx) + x / Number(tl.dataset.ppd));
    let line = overlay.querySelector('.tl__cursor');
    if (!line) { line = document.createElement('i'); line.className = 'tl__cursor'; overlay.appendChild(line); }
    line.style.left = `${x.toFixed(1)}px`;

    let tag = axis.querySelector('.tl__cursor-date');
    if (!tag) { tag = document.createElement('span'); tag.className = 'tl__cursor-date'; axis.appendChild(tag); }
    tag.textContent = `${ymd(idx)}(${WEEKDAY[weekdayOf(idx)]})`;
    // 標籤置中在線上,但不要超出可視範圍(左邊不要被名稱欄蓋住)
    const w = tag.offsetWidth;
    const visL = tl.scrollLeft;                                   // 可視範圍在軌道座標的左緣
    const visW = tl.clientWidth - labelW;
    const lx = Math.max(visL + 2, Math.min(x - w / 2, visL + visW - w - 2));
    tag.style.left = `${lx.toFixed(1)}px`;
  };

  host.addEventListener('pointermove', (e) => { last = { x: e.clientX, y: e.clientY }; update(); });
  host.addEventListener('pointerleave', () => { last = null; hide(); });
  host.addEventListener('scroll', update, true); // scroll 不會往上冒泡,用 capture 接 .tl 的捲動;滑鼠沒動時線也跟著對應的日期移動
}
