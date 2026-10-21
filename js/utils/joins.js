// 判斷同一列裡哪些配置長條「銜接」在一起,銜接處不畫圓角(否則看起來像兩筆不相關的資料)
// items: 同一列的所有配置 [{ key, from, to }];key = 專案或成員,同一個 key 才可能銜接
// 銜接條件:後一筆的開始日 ≤ 前一筆的結束日 + 1(結束日隔天接著開始,或日期重疊)
// 結果寫在每筆的 joinL(左側接著前一筆)與 joinR(右側接著後一筆)
export function markJoins(items) {
  const byKey = new Map();
  items.forEach((it) => {
    it.joinL = false;
    it.joinR = false;
    if (!byKey.has(it.key)) byKey.set(it.key, []);
    byKey.get(it.key).push(it);
  });
  byKey.forEach((list) => {
    list.sort((a, b) => a.from - b.from || a.to - b.to);
    for (let i = 1; i < list.length; i += 1) {
      if (list[i].from <= list[i - 1].to + 1) {
        list[i - 1].joinR = true;
        list[i].joinL = true;
      }
    }
  });
}

// 供長條的 class 使用
export const joinClass = (it) => `${it.joinL ? ' join-l' : ''}${it.joinR ? ' join-r' : ''}`;
