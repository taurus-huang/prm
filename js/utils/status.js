import { STATUS_ORDER } from './constants.js';

export const PENDING_KEY = 'PENDING'; // 篩選按鈕中 Pending 按鈕的代號

// 是否暫緩:以 projects.pending 欄位為準;舊資料若 status 仍是 'Pending',也視為暫緩
export const isPending = (p) => p.pending === true || p.status === 'Pending';

// 真正的狀態(BD / NPI / MP);無法辨識時當作 BD
export const baseStatus = (p) => (STATUS_ORDER.includes(p.status) ? p.status : 'BD');

// 決定長條 / 色條外觀用的 key:暫緩的專案一律用 Pending 外觀(灰色、虛線)
export const styleStatus = (p) => (isPending(p) ? 'Pending' : baseStatus(p));

// 篩選用的分類:暫緩中的專案歸在 'PENDING',其餘依真正的狀態歸在 'BD' / 'NPI' / 'MP'(每個專案只屬於一類)
export const categoryOf = (p) => (isPending(p) ? PENDING_KEY : baseStatus(p));

// selected:被勾選的分類代號(Set);勾選哪一類就顯示哪一類,全都沒勾 → 不顯示任何專案
export const matchesFilter = (p, selected) => selected.has(categoryOf(p));
