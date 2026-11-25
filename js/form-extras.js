/* ==========================================================================
   form-extras.js — 報名表的附加功能
   1) 頁尾的「加入工會官方 LINE」按鈕（含 LINE 圖示）
   2) 報名成功視窗（含受理編號、LINE 按鈕、N 秒後自動前往 LINE）
   3) 「我不是機器人」驗證（Cloudflare Turnstile）
   這個檔案自帶樣式（下方 EXTRAS_CSS），不依賴 style.css，所以不會被舊的快取影響。
   設定都在 js/config.js（LINE_URL、LINE_REDIRECT_SECONDS、TURNSTILE_SITE_KEY）
   ========================================================================== */

/* 要加上這些功能的所有表單 id */
const EXTRA_FORM_IDS = [
    'applyForm', 'laborForm', 'serviceApplyForm',
    'govCourseForm', 'selfCourseForm', 'skillCourseForm', 'maternityCourseForm', 'massageCourseForm'
];

const lineConfigured = () => typeof LINE_URL === 'string' && /^https?:\/\//.test(LINE_URL);
const turnstileConfigured = () => typeof TURNSTILE_SITE_KEY === 'string' && TURNSTILE_SITE_KEY.trim() !== '';

const escHtml = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------ 樣式（自帶，不依賴 style.css） ------------------------------ */

const EXTRAS_CSS = `
.turnstile-wrap { margin: 8px 0 14px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-height: 70px; }
.turnstile-status { margin: 0; font-size: 13px; color: #c53030; font-weight: bold; }
.turnstile-status:empty { display: none; }

.footer-line-btn {
  display: inline-flex; align-items: center; gap: 8px; margin: 6px 0 2px; padding: 8px 18px 8px 10px;
  border-radius: 999px; background: #06c755; color: #fff !important; font-weight: bold; font-size: 15px;
  text-decoration: none !important; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25); transition: filter 0.15s, transform 0.15s;
}
.footer-line-btn:hover { filter: brightness(0.94); transform: translateY(-1px); }
.footer-line-btn svg, .success-line-btn svg { flex: 0 0 auto; display: block; }

.form-closed-notice {
  background: #fffaf0; border: 1px solid #fbd38d; border-left: 5px solid #d96b43; border-radius: 12px;
  padding: 26px 22px; margin: 6px 0 24px; text-align: center;
}
.form-closed-icon { font-size: 34px; line-height: 1; margin-bottom: 8px; }
.form-closed-title { margin: 0 0 10px; font-size: 20px; font-weight: bold; color: #7b341e; }
.form-closed-msg { margin: 0 auto 16px; max-width: 560px; font-size: 15px; line-height: 1.8; color: #4a5568; }
.form-closed-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 22px; border-radius: 999px;
  background: #d96b43; color: #fff !important; font-weight: bold; font-size: 15px; text-decoration: none !important;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
}
.form-closed-btn.is-line { background: #06c755; padding-left: 12px; }
.form-closed-btn:hover { filter: brightness(0.94); }

.success-overlay {
  position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 100000; background: rgba(15, 23, 42, 0.6);
  display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box;
}
.success-box {
  background: #fff; width: 100%; max-width: 440px; max-height: 92vh; overflow-y: auto; box-sizing: border-box;
  border-radius: 16px; padding: 28px 24px 22px; text-align: center; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
  font-family: inherit;
}
.success-icon {
  width: 56px; height: 56px; margin: 0 auto 10px; border-radius: 50%; background: #38a169; color: #fff;
  font-size: 32px; line-height: 56px; font-weight: bold;
}
.success-title { margin: 0 0 8px; font-size: 22px; color: #22543d; }
.success-msg { margin: 0 0 14px; font-size: 15px; line-height: 1.7; color: #2d3748; text-align: left; }
.success-receipt {
  background: #fffaf0; border: 1px dashed #ed8936; border-radius: 10px; padding: 10px 12px;
  margin-bottom: 14px; font-size: 15px; color: #7b341e;
}
.success-receipt b { font-size: 18px; letter-spacing: 1px; }
.success-receipt small { display: block; margin-top: 4px; font-size: 12px; color: #975a16; }
.success-line-btn {
  display: flex; align-items: center; justify-content: center; gap: 10px; padding: 11px 16px; border-radius: 12px;
  background: #06c755; color: #fff !important; font-weight: bold; font-size: 16px; text-decoration: none !important;
  box-shadow: 0 4px 10px rgba(6, 199, 85, 0.3);
}
.success-line-btn:hover { filter: brightness(0.93); }
.success-countdown { margin: 10px 0 0; font-size: 13px; color: #4a5568; min-height: 18px; }
.success-actions { display: flex; gap: 10px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
.success-actions button { border: none; border-radius: 20px; padding: 9px 22px; font-size: 14px; font-weight: bold; cursor: pointer; }
.success-primary { background: #d96b43; color: #fff; }
.success-secondary { background: #edf2f7; color: #2d3748; }
`;

(function injectExtrasStyles() {
    if (document.getElementById('formExtrasStyle')) return;
    const st = document.createElement('style');
    st.id = 'formExtrasStyle';
    st.textContent = EXTRAS_CSS;
    document.head.appendChild(st);
})();

/* LINE 圖示（綠底、白色對話框、LINE 字樣）。想換成官方圖檔時，改這一行即可 */
function lineIconSvg(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" role="img" aria-label="LINE" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="48" rx="11" fill="#06C755"/>
        <path fill="#fff" d="M24 9.5c-9 0-16.3 5.8-16.3 13 0 6.4 5.8 11.8 13.7 12.8.5.1 1.3.4 1.5.9.2.4.1 1.1.1 1.5l-.2 1.4c-.1.4-.3 1.7 1.5.9s9.5-5.6 13-9.6c2.4-2.6 3.3-5.2 3.3-7.9 0-7.2-7.3-13-16.6-13z"/>
        <text x="24" y="27" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="10.5" fill="#06C755">LINE</text>
    </svg>`;
}

/* ------------------------------ 機器人驗證 (Cloudflare Turnstile) ------------------------------ */

let turnstileScriptPromise = null;

function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.defer = true;
        s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
        s.onerror = () => { turnstileScriptPromise = null; reject(new Error('turnstile load failed')); };
        document.head.appendChild(s);
    });
    return turnstileScriptPromise;
}

/* 把驗證元件畫進 slot（只在表單頁真的被看到時才畫，隱藏的頁面不會載入） */
function renderTurnstileSlot(slot) {
    if (slot.dataset.rendering === '1') return;
    slot.dataset.rendering = '1';
    const status = slot.parentElement.querySelector('.turnstile-status');

    loadTurnstileScript().then(ts => {
        const widgetId = ts.render(slot, {
            sitekey: TURNSTILE_SITE_KEY.trim(),
            language: 'zh-tw',
            theme: 'light',
            callback: () => { if (status) status.textContent = ''; },
            'expired-callback': () => { if (status) status.textContent = '驗證已逾時，請重新勾選。'; },
            'error-callback': () => { if (status) status.textContent = '驗證元件發生問題，請重新整理頁面後再試。'; }
        });
        slot.dataset.widgetId = widgetId;
    }).catch(() => {
        slot.dataset.rendering = '';
        if (status) status.textContent = '無法載入「我不是機器人」驗證（可能被瀏覽器或廣告攔截器擋住），請重新整理頁面，或來電 (03) 526-5126 報名。';
    });
}

function getTurnstileSlot(form) {
    return form ? form.querySelector('.turnstile-slot') : null;
}

/* 取得這張表單目前的驗證結果（沒啟用驗證時回傳 ''） */
function getTurnstileToken(form) {
    if (!turnstileConfigured()) return '';
    const slot = getTurnstileSlot(form);
    if (!slot || slot.dataset.widgetId === undefined || !window.turnstile) return '';
    try { return window.turnstile.getResponse(slot.dataset.widgetId) || ''; } catch (e) { return ''; }
}

/* 驗證碼只能用一次，每次送出（不論成功失敗）後都要重置 */
function resetTurnstile(form) {
    const slot = getTurnstileSlot(form);
    if (!slot || slot.dataset.widgetId === undefined || !window.turnstile) return;
    try { window.turnstile.reset(slot.dataset.widgetId); } catch (e) { /* 忽略 */ }
}

/* 送出前呼叫：沒完成驗證就提醒並回傳 false */
function ensureHuman(form) {
    if (!turnstileConfigured()) return true;
    if (getTurnstileToken(form)) return true;
    const slot = getTurnstileSlot(form);
    if (slot) {
        slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const status = slot.parentElement.querySelector('.turnstile-status');
        if (status) status.textContent = '請先勾選「我不是機器人」。';
        if (slot.dataset.widgetId === undefined) renderTurnstileSlot(slot);
    }
    alert('請先勾選表單下方的「我不是機器人」驗證，再按送出。');
    return false;
}

/* ------------------------------ 把驗證元件放進每張表單 ------------------------------ */

function injectFormExtras(form) {
    if (!form || form.dataset.extrasReady === '1') return;
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    form.dataset.extrasReady = '1';
    const row = button.parentElement;

    // 機器人驗證：放在送出鈕上方
    if (turnstileConfigured()) {
        const wrap = document.createElement('div');
        wrap.className = 'turnstile-wrap';
        wrap.innerHTML = '<div class="turnstile-slot"></div><p class="turnstile-status" role="alert"></p>';
        row.parentNode.insertBefore(wrap, row);
        const slot = wrap.querySelector('.turnstile-slot');

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(entries => {
                if (entries.some(e => e.isIntersecting)) { io.disconnect(); renderTurnstileSlot(slot); }
            }, { rootMargin: '200px' });
            io.observe(slot);
        } else {
            renderTurnstileSlot(slot);
        }
    }
}

/* ------------------------------ 頁尾：加入工會官方 LINE ------------------------------ */

function injectFooterLine() {
    if (!lineConfigured()) return;
    const footer = document.querySelector('footer');
    if (!footer || footer.querySelector('.footer-line-btn')) return;
    const p = document.createElement('p');
    p.innerHTML = `<a class="footer-line-btn" href="${escHtml(LINE_URL)}" target="_blank" rel="noopener">${lineIconSvg(28)}<span>加入工會官方 LINE</span></a>`;
    const copyright = footer.querySelector('.footer-copyright');
    if (copyright) footer.insertBefore(p, copyright); else footer.appendChild(p);
}

/* ------------------------------ 報名成功視窗 ------------------------------ */

let successTimer = null;

function closeSuccessModal() {
    if (successTimer) { clearInterval(successTimer); successTimer = null; }
    const old = document.getElementById('successOverlay');
    if (old) old.remove();
    document.removeEventListener('keydown', successEscHandler);
}

function successEscHandler(e) {
    if (e.key === 'Escape') closeSuccessModal();
}

/* message：成功訊息（\n 會換行）；receipt：受理編號（沒有就不顯示） */
function showSuccessModal({ message, receipt }) {
    closeSuccessModal();

    const hasLine = lineConfigured();
    const seconds = hasLine ? Math.max(0, Math.floor(Number(typeof LINE_REDIRECT_SECONDS === 'number' ? LINE_REDIRECT_SECONDS : 0))) : 0;

    const overlay = document.createElement('div');
    overlay.id = 'successOverlay';
    overlay.className = 'success-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '報名完成');
    overlay.innerHTML = `
        <div class="success-box">
            <div class="success-icon" aria-hidden="true">✓</div>
            <h3 class="success-title">送出成功！</h3>
            <p class="success-msg">${escHtml(message).replace(/\n/g, '<br>')}</p>
            ${receipt ? `<div class="success-receipt">您的受理編號：<b>${escHtml(receipt)}</b><small>請截圖或抄下，聯絡工會時提供此編號可更快查詢</small></div>` : ''}
            ${hasLine ? `
                <a class="success-line-btn" href="${escHtml(LINE_URL)}" target="_blank" rel="noopener">${lineIconSvg(30)}<span>加入工會 LINE，與我們聯繫</span></a>
                ${seconds > 0 ? '<p class="success-countdown" id="successCountdown"></p>' : ''}` : ''}
            <div class="success-actions">
                ${seconds > 0 ? '<button type="button" id="successCancel" class="success-secondary">取消自動跳轉</button>' : ''}
                <button type="button" id="successClose" class="success-primary">關閉</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    document.addEventListener('keydown', successEscHandler);

    overlay.querySelector('#successClose').addEventListener('click', closeSuccessModal);

    if (seconds > 0) {
        const countdownEl = overlay.querySelector('#successCountdown');
        const cancelBtn = overlay.querySelector('#successCancel');
        let left = seconds;
        const paint = () => { countdownEl.textContent = `${left} 秒後將自動前往工會 LINE`; };
        paint();
        successTimer = setInterval(() => {
            left -= 1;
            if (left <= 0) {
                clearInterval(successTimer);
                successTimer = null;
                countdownEl.textContent = '正在前往工會 LINE…';
                window.location.href = LINE_URL;
            } else {
                paint();
            }
        }, 1000);
        cancelBtn.addEventListener('click', () => {
            clearInterval(successTimer);
            successTimer = null;
            countdownEl.textContent = '已取消自動跳轉，您可以隨時點上方按鈕加入 LINE。';
            cancelBtn.remove();
        });
    }
    overlay.querySelector('.success-primary').focus();
}

/* ------------------------------ 表單開關（後台「表單開關」分頁） ------------------------------ */

/* 表單代碼 → 網頁上的表單 id。課程報名表由「課程梯次」控制，不在這裡 */
const FORM_SWITCH_IDS = { apply: 'applyForm', labor: 'laborForm', service: 'serviceApplyForm' };
const FORM_SWITCH_CACHE_KEY = 'hcmccuFormSwitches';

/* 套用後台的開關：
   • 關閉 → 隱藏表單（與標記 data-form-intro 的說明文字），改顯示公告；
            標記 data-form-entry 的入口（選單、按鈕）改成導向「聯絡按鈕連結」（例如專屬 LINE）；
            標記 data-form-closed-only 的提示文字才會顯示
   • 開放 → 全部恢復原狀 */
function applyFormSwitches(forms, save = true) {
    if (!forms || typeof forms !== 'object') return;
    Object.keys(FORM_SWITCH_IDS).forEach(type => {
        const form = document.getElementById(FORM_SWITCH_IDS[type]);
        if (!form || !form.parentElement) return;
        const sw = forms[type];
        const closed = Boolean(sw && sw.open === false);
        const url = closed && /^https?:\/\//i.test(sw.linkUrl || '') ? sw.linkUrl : '';
        const isLine = /line\.me|lin\.ee/i.test(url);
        let notice = form.parentElement.querySelector(`.form-closed-notice[data-form-type="${type}"]`);

        document.querySelectorAll(`[data-form-intro="${type}"]`).forEach(el => { el.style.display = closed ? 'none' : ''; });
        document.querySelectorAll(`[data-form-closed-only="${type}"]`).forEach(el => { el.style.display = closed ? '' : 'none'; });

        // 入口（導覽選單、「填寫登記」按鈕）：關閉且有連結 → 改導向該連結；其他情況 → 還原成原本的網頁表單
        document.querySelectorAll(`[data-form-entry="${type}"]`).forEach(el => {
            if (el.dataset.origOnclick === undefined) {
                el.dataset.origOnclick = el.getAttribute('onclick') || '';
                el.dataset.origText = el.textContent;
            }
            if (url) {
                el.removeAttribute('onclick');
                el.setAttribute('href', url);
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener');
                const closedText = el.getAttribute('data-closed-text');
                if (closedText) el.textContent = closedText;
            } else {
                if (el.dataset.origOnclick) el.setAttribute('onclick', el.dataset.origOnclick);
                el.removeAttribute('href');
                el.removeAttribute('target');
                el.removeAttribute('rel');
                el.textContent = el.dataset.origText;
            }
        });

        if (closed) {
            form.style.display = 'none';
            if (!notice) {
                notice = document.createElement('div');
                notice.className = 'form-closed-notice';
                notice.setAttribute('data-form-type', type);
                notice.setAttribute('role', 'status');
                form.parentElement.insertBefore(notice, form);
            }
            const title = sw.title || '目前暫停線上登記';
            const msg = sw.message || '本表單目前暫停受理，如有需求請來電 (03) 526-5126 洽詢。';
            const btnText = sw.linkText || (isLine ? '加入 LINE 洽詢' : '前往聯絡');
            notice.innerHTML = `
                <div class="form-closed-icon" aria-hidden="true">${isLine ? '💬' : '🔒'}</div>
                <h3 class="form-closed-title">${escHtml(title)}</h3>
                <p class="form-closed-msg">${escHtml(msg).replace(/\n/g, '<br>')}</p>
                ${url ? `<a class="form-closed-btn${isLine ? ' is-line' : ''}" href="${escHtml(url)}" target="_blank" rel="noopener">${isLine ? lineIconSvg(26) : ''}<span>${escHtml(btnText)}</span></a>` : ''}`;
        } else {
            form.style.display = '';
            if (notice) notice.remove();
        }
    });
    if (save) {
        try { localStorage.setItem(FORM_SWITCH_CACHE_KEY, JSON.stringify(forms)); } catch (e) { /* 忽略 */ }
    }
}

/* ------------------------------ 初始化 ------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
    // 先套用上次記住的表單開關，避免關閉的表單先閃一下才消失（之後會被後台最新狀態覆蓋）
    try {
        const cached = JSON.parse(localStorage.getItem(FORM_SWITCH_CACHE_KEY) || 'null');
        if (cached) applyFormSwitches(cached, false);
    } catch (err) { /* 忽略 */ }
    try { injectFooterLine(); } catch (err) { console.error('[頁尾 LINE]', err); }
    EXTRA_FORM_IDS.forEach(id => {
        try { injectFormExtras(document.getElementById(id)); }
        catch (err) { console.error('[報名表附加功能] ' + id, err); }
    });
});
