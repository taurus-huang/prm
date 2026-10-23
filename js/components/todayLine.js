import { dayIndex } from '../utils/date.js';
import { todayStr } from '../utils/phase.js';
import { mmdd, dayFraction } from './timeAxis.js';

// 「今天」的紅線與旗標跟著時間慢慢往右移:每分鐘依現在的時間重新定位;跨過午夜時旗標的日期也跟著換。
// 分頁在背景時瀏覽器會讓計時器變慢,所以分頁回到前景時也會立刻更新一次。專案總覽與人力資源總覽共用。
export function attachTodayLine(tl) {
  const line = tl.querySelector('.tl__today');
  const flag = tl.querySelector('.tl__today-flag');
  if (!line || !flag) return;

  const tick = () => {
    if (!tl.isConnected) { stop(); return; } // 時間軸被重新繪製(舊的已離開頁面)就停止
    const now = new Date();
    const idx = dayIndex(todayStr(now));
    const x = ((idx + dayFraction(now) - Number(tl.dataset.startIdx)) * Number(tl.dataset.ppd)).toFixed(1);
    line.style.left = `${x}px`;
    flag.style.left = `${x}px`;
    flag.textContent = `今天 ${mmdd(idx)}`;
    tl.dataset.todayX = x;
    tl.dispatchEvent(new Event('todaymove')); // 「今天」箭頭重新判斷方向
  };
  const onVisible = () => { if (!document.hidden) tick(); };
  const timer = setInterval(tick, 60000);
  const stop = () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  document.addEventListener('visibilitychange', onVisible);
}
