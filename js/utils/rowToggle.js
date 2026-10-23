// 「每一列(成員 / 專案)各自決定要不要顯示配置」的狀態,專案總覽與人力資源總覽共用。
//  - 預設值 all:所有列一開始是否顯示(右上角 checkbox 的記憶值)
//  - 個別列被雙擊切換後,記在 overrides;之後按右上角 checkbox 會清掉所有個別設定,全部一起開或關
//  - state(ids):'all' 全都顯示 / 'none' 全都不顯示 / 'some' 只有部分顯示
export function createRowToggle(initialAll) {
  let all = initialAll;
  const overrides = new Map();
  const api = {
    isOn: (id) => (overrides.has(id) ? overrides.get(id) : all),
    toggle(id) { overrides.set(id, !api.isOn(id)); },
    setAll(v) { all = v; overrides.clear(); },
    state(ids) {
      const on = ids.filter((id) => api.isOn(id)).length;
      if (!ids.length) return all ? 'all' : 'none';
      return on === 0 ? 'none' : on === ids.length ? 'all' : 'some';
    },
  };
  return api;
}

// 依狀態更新 tri-state checkbox:全部 = 勾選;全無 = 未勾選;部分 = 不確定(indeterminate,顯示為橫線)
export function syncTriState(box, state) {
  box.checked = state === 'all';
  box.indeterminate = state === 'some';
}
