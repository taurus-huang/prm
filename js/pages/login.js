import { redirectIfLoggedIn, signIn } from '../auth.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

await redirectIfLoggedIn();

const form = document.querySelector('#login-form');
const errorEl = document.querySelector('#form-error');
const btn = document.querySelector('#submit-btn');

// js/config.js 還是範本預設值(例如換新版時被覆蓋),直接提示,不要等到連線失敗
if (SUPABASE_URL.includes('YOUR-PROJECT-ID') || SUPABASE_ANON_KEY.startsWith('YOUR-')) {
  errorEl.textContent = '尚未設定 Supabase:請編輯 js/config.js,填入 Project URL 與 anon key。';
  btn.disabled = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    errorEl.textContent = '請輸入 Email 與密碼';
    return;
  }
  btn.disabled = true;
  btn.textContent = '登入中…';
  try {
    await signIn(email, password);
    location.replace('projects.html');
  } catch (err) {
    if (err.message === 'Invalid login credentials') {
      errorEl.textContent = 'Email 或密碼錯誤';
    } else if (/failed to fetch|networkerror|load failed/i.test(err.message)) {
      errorEl.textContent = '無法連線到 Supabase:請確認 js/config.js 的 Project URL 正確(格式 https://xxxx.supabase.co,不要加 /rest/v1)、網路可連線,且專案未被暫停。';
    } else {
      errorEl.textContent = `登入失敗:${err.message}`;
    }
    btn.disabled = false;
    btn.textContent = '登入';
  }
});
