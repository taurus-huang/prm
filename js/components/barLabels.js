import { getLabelW } from './timeAxis.js';

// 配置長條的名稱標示:同一組(同一專案 / 同一成員的同一列)只在「目前看得到的最左邊、且放得下名稱」的那一段標示名稱。
// 捲動、縮放、視窗大小改變時即時重新決定,所以最左邊那段被捲出畫面後,名稱會改標在右邊下一段。
// 專案總覽與人力資源總覽共用。長條需要這些 data 屬性:
//   data-lg           組別(同一組的長條只會有一個顯示名稱)
//   data-x / data-w   長條在軌道上的左緣與寬度(px)
//   data-name-w       顯示名稱所需的寬度(px)
//   data-label-name   被選為「標示名稱」的那一段要顯示的文字
//   data-label-other  同組其他段要顯示的文字(可為空)
// 長條內需有 .bar-label 元素放文字。
export function attachBarLabels(tl) {
  const groups = new Map();
  tl.querySelectorAll('[data-lg]').forEach((bar) => {
    const key = bar.dataset.lg;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bar);
  });
  if (!groups.size) return;
  groups.forEach((list) => list.sort((a, b) => Number(a.dataset.x) - Number(b.dataset.x)));

  const setText = (bar, text) => {
    const label = bar.querySelector('.bar-label');
    if (!label) return;
    if (label.textContent !== text) label.textContent = text;
    label.hidden = !text;
  };

  const update = () => {
    if (!tl.clientWidth) return; // 容器被隱藏時不處理
    const start = tl.scrollLeft;
    const end = start + tl.clientWidth - getLabelW(tl); // 目前可視的軌道範圍(扣掉左側名稱欄)
    groups.forEach((list) => {
      let chosen = null;
      for (const bar of list) {
        const x = Number(bar.dataset.x);
        const visible = Math.min(x + Number(bar.dataset.w), end) - Math.max(x, start);
        if (visible >= Number(bar.dataset.nameW)) { chosen = bar; break; } // 左緣文字會黏在可視範圍左側,所以只看「看得到的寬度」夠不夠
      }
      list.forEach((bar) => setText(bar, bar === chosen ? bar.dataset.labelName : bar.dataset.labelOther));
    });
  };

  let raf = 0;
  tl.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); });
  }, { passive: true });
  new ResizeObserver(update).observe(tl);
  tl.addEventListener('labelwidth', update); // 名稱欄寬度改變 → 可視的軌道範圍也變了
  update();
}
