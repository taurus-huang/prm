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

  // ---- 手機:兩根手指「橫向」開合 = 同樣的日期尺度縮放(可連續切換多級) ----
  // 用兩根手指一開始的排列方向決定這次手勢歸誰處理(瀏覽器的整頁縮放一旦開始就攔不住,所以必須在一開始決定):
  //   兩指接近水平排列(水平距離 > 垂直距離)= 橫向縮放:由這裡處理。張開 = 放大(往「日」),捏合 = 縮小(往「年」)
  //   兩指接近垂直排列 = 縱向縮放:不處理,維持瀏覽器原本的行為(縮放整個畫面)
  // 手勢進行中,兩指水平距離每變化約 STEP_RATIO 倍就切換一格尺度,切換後以新的距離當起點,所以一次手勢可以連續切換很多級。
  // 只在時間軸本體(第一列日期列、第一欄名稱欄不算,那裡維持瀏覽器原本的手勢)。
  const STEP_RATIO = 1.25;
  const PINCH_COOLDOWN = 60;
  const MIN_SPAN = 24; // 兩指水平距離小於這個值時不處理
  const inBody = (t) => t.target instanceof Element && t.target.closest('.tl') && !t.target.closest('.tl__head, .tl__label');
  let pinch = null; // { dx }
  let pinchStep = 0;
  const hSpan = (e) => Math.abs(e.touches[0].clientX - e.touches[1].clientX);
  const vSpan = (e) => Math.abs(e.touches[0].clientY - e.touches[1].clientY);

  const onMove = (e) => {
    if (!pinch || e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();
    const dx = hSpan(e);
    const ratio = dx / pinch.dx;
    if (ratio < STEP_RATIO && ratio > 1 / STEP_RATIO) return;
    const dir = ratio > 1 ? -1 : 1; // 張開 = 放大(往「日」);捏合 = 縮小(往「年」)
    pinch.dx = dx;                   // 不管有沒有真的切換,都以現在的距離當新的起點
    const now = performance.now();
    if (now - pinchStep < PINCH_COOLDOWN) return;
    const i = ZOOM_ORDER.indexOf(getKey());
    const j = Math.min(ZOOM_ORDER.length - 1, Math.max(0, i + dir));
    if (j === i) return;
    pinchStep = now;
    // 切換尺度會重畫時間軸(舊的 .tl 被換掉),所以每次都重新找現在的 .tl
    const tl = container.querySelector('.tl');
    if (!tl) return;
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    onChange(ZOOM_ORDER[j], captureAnchor(tl, { clientX: cx, clientY: cy })); // 兩指中央的日期與資料列留在原處
  };
  const onEnd = (e) => { if (e.touches.length < 2) pinch = null; };
  // 觸控事件永遠送給「手指一開始按下的那個元素」;重畫後那個元素會被移出頁面,事件就不會再往上冒泡到容器。
  // 所以手勢開始時,直接在兩根手指按下的元素上掛監聽,這樣重畫之後手勢仍然持續有效
  const bound = new Set();
  const bind = (el) => {
    if (bound.has(el)) return;
    bound.add(el);
    el.addEventListener('touchmove', onMove, { passive: false });
    const release = (e) => { onEnd(e); if (!pinch) { bound.forEach((n) => { n.removeEventListener('touchmove', onMove); n.removeEventListener('touchend', release); n.removeEventListener('touchcancel', release); }); bound.clear(); } };
    el.addEventListener('touchend', release);
    el.addEventListener('touchcancel', release);
  };
  container.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2 || !inBody(e.touches[0]) || !inBody(e.touches[1])) { pinch = null; return; }
    if (hSpan(e) < MIN_SPAN || hSpan(e) <= vSpan(e)) { pinch = null; return; } // 縱向(或太近)→ 交給瀏覽器縮放整個畫面
    pinch = { dx: hSpan(e) };
    bind(e.touches[0].target);
    bind(e.touches[1].target);
    if (e.cancelable) e.preventDefault(); // 橫向縮放由我們處理,不要讓瀏覽器縮放整個網頁
  }, { passive: false });
  // iOS Safari:整頁縮放走 gesture 事件;只有橫向縮放時才擋
  ['gesturestart', 'gesturechange'].forEach((n) => container.addEventListener(n, (e) => { if (pinch) e.preventDefault(); }));
}
