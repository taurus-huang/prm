import { STATUS_ORDER } from './constants.js';

// 專案狀態(BD / NPI / MP / EOL / Pending),只看 projects.status;無法辨識時當作 BD
export const baseStatus = (p) => (STATUS_ORDER.includes(p.status) ? p.status : 'BD');

// 是否暫緩:status 為 'Pending'
export const isPending = (p) => baseStatus(p) === 'Pending';

// 決定長條 / 色條外觀用的 key(與狀態相同;Pending 為灰色虛線、EOL 為深灰)
export const styleStatus = (p) => baseStatus(p);

// selected:被勾選的狀態(Set);勾選哪一種就顯示哪一種,全都沒勾 → 不顯示任何專案
export const matchesFilter = (p, selected) => selected.has(baseStatus(p));
