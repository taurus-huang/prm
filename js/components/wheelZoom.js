import { ZOOM_ORDER } from './timeAxis.js';
import { captureAnchor } from './scrollAnchor.js';

// Ctrl + 滑鼠滾輪調整日期尺度(日 ⇄ 週 ⇄ 旬 ⇄ 月 ⇄ 季 ⇄ 年)。專案總覽與人力資源總覽共用。
//   滾輪往上 = 放大(尺度變細,往「日」);往下 = 縮小(尺度變粗,往「年」)
//   縮放後,滑鼠指著的那個日期、以及那一列資料,都會留在畫面上同一個位置
// container:放時間軸的容器(時間軸會被重新繪製,所以事件綁在容器上)
// getKey():目前的尺度代號;onChange(key, anchor):要切換到新的尺度,anchor 由 scrollAnchor.js 的 captureAnchor 產生
export function attachWheelZoom(container, { getKey, onChange }) {
  const THRESHOLD = 50;   // 累積滾動量達到這個值才算一格(觸控板的捏合會連續送出很小的數值)
  const COOLDOWN = 120;   // 切換後的冷卻時間(ms),避免一次手勢跳過好幾個尺度
  let acc = 0;
  let idleTimer = 0;
  let lastStep = 0;

  container.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return; // 沒按 Ctrl 就是一般的捲動
    const tl = e.target instanceof Element ? e.target.closest('.tl') : null;
    if (!tl) return;
    e.preventDefault(); // 阻止瀏覽器把整個網頁放大縮小(只有滑鼠在時間軸上時)

    const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; // 行 / 頁 換算成 px
    acc += e.deltaY * lines;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { acc = 0; }, 300);
    if (Math.abs(acc) < THRESHOLD) return;

    const dir = acc > 0 ? 1 : -1;
    acc = 0;
    const now = performance.now();
    if (now - lastStep < COOLDOWN) return;

    const i = ZOOM_ORDER.indexOf(getKey());
    const j = Math.min(ZOOM_ORDER.length - 1, Math.max(0, i + dir));
    if (j === i) return; // 已經是最細或最粗
    lastStep = now;

    // 錨點:滑鼠指著的日期與資料列(滑鼠在軌道之外時,水平改用畫面中央)
    onChange(ZOOM_ORDER[j], captureAnchor(tl, { clientX: e.clientX, clientY: e.clientY }));
  }, { passive: false }); // 要呼叫 preventDefault,不能是 passive
}
