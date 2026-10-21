import { getLabelW } from './timeAxis.js';

// 縮放(按鈕或 Ctrl + 滾輪)或重新繪製時,用來「記住並還原」畫面位置的錨點。專案總覽與人力資源總覽共用。
//   水平:某個日期(day),以及它在可視軌道內的位置(offset)
//   垂直:某一列(row.index)、該列內的相對位置(row.frac,0~1)、以及那一點在視窗中的 y 座標(row.viewportY)
// 垂直用「第幾列 + 列內比例」而不是捲動距離,因為不同日期尺度下每一列的高度可能不同
// (標籤太擠時會錯開、列會變高),只記捲動距離的話,縮放後指著的會變成別列。

// clientX / clientY:要當錨點的視窗座標(滑鼠位置);沒給就用畫面中央。
// vertical:false 時只記水平(篩選、搜尋改變時用,列會變動,垂直維持原本回到最上面的行為)
export function captureAnchor(tl, { clientX = null, clientY = null, vertical = true } = {}) {
  const rect = tl.getBoundingClientRect();
  const labelW = getLabelW(tl);
  const vis = tl.clientWidth - labelW;
  let offset = clientX === null ? vis / 2 : clientX - rect.left - labelW;
  if (offset < 0 || offset > vis) offset = vis / 2; // 滑鼠在名稱欄或軌道之外 → 改用畫面中央

  const anchor = {
    day: Number(tl.dataset.startIdx) + (tl.scrollLeft + offset) / Number(tl.dataset.ppd),
    offset,
    vertical,
    scrollTop: tl.scrollTop,
    row: null,
  };

  if (vertical) {
    const y = clientY === null ? rect.top + tl.clientHeight / 2 : clientY;
    const headBottom = tl.querySelector('.tl__head').getBoundingClientRect().bottom;
    if (y >= headBottom) { // 滑鼠在日期列上時不指定列,改成維持原本的捲動位置
      const rows = [...tl.querySelectorAll('.tl__row')];
      const index = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return y >= b.top && y < b.bottom; });
      if (index >= 0) {
        const b = rows[index].getBoundingClientRect();
        anchor.row = { index, frac: (y - b.top) / b.height, viewportY: y };
      }
    }
  }
  return anchor;
}

// 在新繪製出來的 tl 上還原錨點
export function restoreAnchor(tl, anchor) {
  tl.scrollLeft = (anchor.day - Number(tl.dataset.startIdx)) * Number(tl.dataset.ppd) - anchor.offset;
  if (!anchor.vertical) return;
  if (!anchor.row) { tl.scrollTop = anchor.scrollTop; return; }

  const row = tl.querySelectorAll('.tl__row')[anchor.row.index];
  if (!row) return;
  const b = row.getBoundingClientRect();
  const delta = b.top + anchor.row.frac * b.height - anchor.row.viewportY; // 那一點現在比原本的位置低了多少
  if (!delta) return;
  if (tl.scrollHeight > tl.clientHeight + 1) tl.scrollTop += delta; // 時間軸自己有垂直捲軸
  else window.scrollBy(0, delta);                                   // 窄螢幕:由整個網頁捲動
}
