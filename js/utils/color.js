// 顏色共用:每個對象(成員或專案)一個固定色相,投入 % 越高顏色越深

// 第 i 個對象的色相:黃金角度分配,相鄰對象色相差距大
export function hueForIndex(i) {
  return Math.round((205 + i * 137.508) % 360);
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

// 同一對象用同一色相;pct 越高顏色越深。文字顏色依背景明暗自動選白或深色
export function allocColor(pct, hue) {
  const l = 95 - 65 * (pct / 100); // 0% → 84%(淺),100% → 32%(深)
  const [r, g, b] = hslToRgb(hue, 0.55, l / 100);
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const fg = 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.064 ? '#fff' : '#16212b';
  return { bg: `rgb(${r}, ${g}, ${b})`, fg };
}
