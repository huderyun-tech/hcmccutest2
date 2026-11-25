/* ==========================================================================
   registration.js — 報名表送出到 Google 試算表、從試算表讀取課程梯次
   （後台程式碼在 apps-script/Code.gs；網址設定在 js/config.js）

   重點：
   1. 不需要替每個欄位加 name：程式會自動用畫面上的標籤文字當欄位名稱。
   2. 每次送出都帶一組「送出代碼」。網路不穩、讀不到回應時，會先去後台
      確認有沒有收到，避免報名者以為沒送出而重複報名。
   3. SHEETS_API_URL 沒填（或後台暫時連不上）時，網站會維持原本的行為，
      不會壞掉。
   ========================================================================== */

const PAGE_LOADED_AT = Date.now();

function isApiConfigured() {
    // 正式網址一定是 https（Google 提供）；http://localhost 只供本機測試使用
    return typeof SHEETS_API_URL === 'string' && /^(https:\/\/|http:\/\/localhost[:/])/.test(SHEETS_API_URL.trim());
}

/* ------------------------------ 欄位收集 ------------------------------ */

const cleanText = s => (s || '').replace(/[\s\u00a0]+/g, ' ').replace(/[*＊※]/g, '').replace(/\s*[：:]\s*$/, '').replace(/\s*[（(](請[^）)]*|必填|選填|可複選)[）)]\s*$/, '').trim();

/* 取得元素本身的文字（不含裡面的輸入欄位） */
function ownText(node) {
    const clone = node.cloneNode(true);
    // data-no-key：只給人看、不能算進欄位名稱的文字（例如題目後面的「（115年度）」），否則每年換年份就會多出新欄位
    clone.querySelectorAll('input, select, textarea, button, [data-no-key]').forEach(e => e.remove());
    return cleanText(clone.textContent).replace(/^[一二三四五六七八九十]+[、.．]\s*/, '');
}

const hasControl = el => !!el.querySelector('input, select, textarea');

/* 這個元素是不是「欄位標題」？ strong=true 只認 label／標題標籤；false 也接受粗體的短文字 */
function isHeadingLike(el, strong) {
    if (hasControl(el)) return false;
    const tag = el.tagName;
    if (tag === 'LABEL' || /^H[2-6]$/.test(tag) || tag === 'LEGEND') return ownText(el).length > 0;
    if (!strong && (tag === 'P' || tag === 'DIV' || tag === 'SPAN') && /font-(bold|medium|semibold)/.test(el.className || '')) {
        const t = ownText(el);
        return t.length > 0 && t.length <= 40;
    }
    return false;
}

/* 從某個元素往上、往前找最近的欄位標題（回傳標題元素） */
function findQuestionNode(start, form) {
    let node = start;
    while (node && node !== form) {
        for (const strong of [true, false]) {
            let sib = node.previousElementSibling;
            for (let hops = 0; sib && hops < 4; hops++, sib = sib.previousElementSibling) {
                if (isHeadingLike(sib, strong)) return sib;
            }
        }
        node = node.parentElement;
    }
    return null;
}
const findQuestion = (start, form) => { const n = findQuestionNode(start, form); return n ? ownText(n) : ''; };

/* 所屬區塊標題，例如「基本個人資料」（去掉前面的「一、」） */
function sectionTitle(el) {
    const card = el.closest('.form-card, fieldset');
    const h = card && card.querySelector('h3, h4, legend');
    return h ? ownText(h).replace(/^[一二三四五六七八九十]+[、.．]\s*/, '').replace(/\s*[（(].*?[）)]\s*$/, '') : '';
}

/* 把「年／月／日」三個下拉選單合併成一個「生日」欄位 */
function collectBirthSelects(form, consumed) {
    const out = [];
    form.querySelectorAll('select[id$="Year"]').forEach(y => {
        const base = y.id.slice(0, -4);
        const m = form.querySelector(`#${CSS.escape(base)}Month`);
        const d = form.querySelector(`#${CSS.escape(base)}Day`);
        if (!m || !d) return;
        [y, m, d].forEach(e => consumed.add(e));
        const label = findQuestion(y.parentElement, form) || '生日';
        const value = (y.value && m.value && d.value) ? `${y.value}-${String(m.value).padStart(2, '0')}-${String(d.value).padStart(2, '0')}` : '';
        out.push({ el: y, key: label, value });
    });
    return out;
}

/* 欄位目前的值（下拉選單取顯示文字） */
function controlValue(el) {
    if (el.tagName === 'SELECT') {
        const opt = el.options[el.selectedIndex];
        return opt && el.value !== '' ? cleanText(opt.textContent) : '';
    }
    return (el.value || '').trim();
}

/* 收集整份表單 → [{k, v}]（空白欄位不送） */
function collectFormData(form) {
    const consumed = new Set();
    const entries = [];                 // { el, key, value }
    const radioGroups = new Map();      // name -> 單選題
    const checkGroups = new Map();      // 標題 -> 複選題
    const headGroups = new Map();       // 標題元素 -> 底下的文字／下拉欄位
    const choiceHeads = new Set();      // 被單選／複選題使用的標題元素

    collectBirthSelects(form, consumed).forEach(e => entries.push(e));

    form.querySelectorAll('input, select, textarea').forEach(el => {
        if (consumed.has(el) || el.disabled) return;
        const type = (el.type || '').toLowerCase();
        if (['button', 'submit', 'reset', 'hidden', 'file', 'image'].includes(type)) return;
        if (el.dataset.regSkip !== undefined) return;

        if (type === 'radio') {
            const group = el.name || `__radio_${entries.length}`;
            if (!radioGroups.has(group)) {
                const optionLabel = el.closest('label') || el.parentElement;
                const qNode = findQuestionNode(optionLabel.parentElement, form) || findQuestionNode(optionLabel, form);
                if (qNode) choiceHeads.add(qNode);
                radioGroups.set(group, { el, question: qNode ? ownText(qNode) : '', picked: '', pickedValue: '', name: el.name });
            }
            if (el.checked) {
                const g = radioGroups.get(group);
                const lab = el.closest('label');
                g.picked = lab ? ownText(lab) : el.value;
                g.pickedValue = el.value;
            }
            return;
        }

        if (type === 'checkbox') {
            const optionLabel = el.closest('label') || el.parentElement;
            const qNode = findQuestionNode(optionLabel.parentElement, form);
            if (qNode) choiceHeads.add(qNode);
            const question = (qNode ? ownText(qNode) : '') || sectionTitle(el) || '勾選項目';
            const key = `${sectionTitle(el)}｜${question}`;
            if (!checkGroups.has(key)) checkGroups.set(key, { el, question, picked: [] });
            if (el.checked) checkGroups.get(key).picked.push(optionLabel ? ownText(optionLabel) : el.value);
            return;
        }

        const value = controlValue(el);
        const placeholder = cleanText(el.getAttribute('placeholder') || '');

        // 和單選／複選選項放在同一個標籤裡的文字欄（例如「其他：____」）
        const ownLabel = el.closest('label');
        if (ownLabel && ownLabel.querySelector('input[type="radio"], input[type="checkbox"]')) {
            const q = findQuestion(ownLabel.parentElement, form);
            entries.push({ el, key: [q, ownText(ownLabel) || placeholder].filter(Boolean).join('｜') || '其他', value });
            return;
        }

        const headNode = findQuestionNode(el, form);
        if (!headNode) {
            entries.push({ el, key: placeholder || cleanText(el.getAttribute('aria-label') || '') || '未命名欄位', value });
            return;
        }
        if (!headGroups.has(headNode)) headGroups.set(headNode, []);
        headGroups.get(headNode).push({ el, value, placeholder, isSelect: el.tagName === 'SELECT', type });
    });

    // 同一個標題底下的欄位
    headGroups.forEach((items, headNode) => {
        const question = ownText(headNode);
        // 緊接在單選／複選題後面的「其它：＿＿」填寫欄
        if (choiceHeads.has(headNode)) {
            items.forEach(i => entries.push({ el: i.el, key: `${question}｜${i.placeholder && i.placeholder !== '請填寫' ? i.placeholder : '其它'}`, value: i.value }));
            return;
        }
        if (items.length === 1) {
            entries.push({ el: items[0].el, key: question, value: items[0].value });
            return;
        }
        const placeholders = items.map(i => i.placeholder);
        const distinct = new Set(placeholders).size === items.length && placeholders.every(p => /^\d+[.、．]/.test(p));
        if (distinct && !items.some(i => i.isSelect)) {
            // 多個各有提示文字的欄位（例如眷屬 1～5 的姓名）：各自獨立，用提示文字當欄位名稱
            items.forEach(i => {
                const sec = sectionTitle(i.el);
                const key = /^\d/.test(i.placeholder) && sec ? `${sec}｜${i.placeholder}` : (i.placeholder.includes(question) ? i.placeholder : `${question}｜${i.placeholder}`);
                entries.push({ el: i.el, key, value: i.value });
            });
        } else {
            // 一個欄位被拆成多格（例如地址的縣市＋區域＋門牌，或開始～結束日期）：合併成一欄
            const allDates = items.every(i => i.type === 'date');
            const glue = allDates ? ' ~ ' : (/區碼/.test(question) ? '-' : ' ');
            const merged = items.map(i => i.value).filter(Boolean).join(glue);
            entries.push({ el: items[0].el, key: question, value: merged });
        }
    });

    radioGroups.forEach(g => {
        entries.push({ el: g.el, key: g.question || '選項', value: g.picked });
        if (g.name && /_selected_batch$/.test(g.name) && g.pickedValue) {
            entries.push({ el: g.el, key: '梯次代碼', value: g.pickedValue });
            const chosen = form.querySelector(`input[name="${g.name}"]:checked`);
            if (chosen && chosen.dataset && chosen.dataset.waitlist === '1') entries.push({ el: g.el, key: '報名類別', value: '候補' });   // 額滿梯次的「登記候補」
        }
    });
    checkGroups.forEach(g => {
        // 很長的同意條款文字不整段存入，只記錄「已勾選」與條款開頭
        const picked = g.picked.map(t => t.length > 40 ? `已勾選：${t.slice(0, 18)}…` : t);
        entries.push({ el: g.el, key: g.question, value: picked.join('、') });
    });

    // 依照畫面上的先後順序排列
    entries.sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
    });

    // 欄位名稱不可重複：重複的名稱一律加上編號 (1)(2)(3)…
    const kept = entries.filter(e => e.value !== '' && e.value != null);
    const total = new Map(), seen = new Map();
    kept.forEach(e => total.set(e.key, (total.get(e.key) || 0) + 1));
    return kept.map(e => {
        let key = e.key;
        if (total.get(key) > 1) { const n = (seen.get(key) || 0) + 1; seen.set(key, n); key = `${key} (${n})`; }
        return { k: key, v: String(e.value) };
    });
}

/* ------------------------------ 與後台溝通 ------------------------------ */

function newSubmissionId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function fetchWithTimeout(url, options, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

/* 後台用 text/plain 接收（這樣瀏覽器不會先送預檢請求，Apps Script 才收得到） */
/* 加速層網址（有設定且是 https 才使用） */
function fastApiBase() {
    return (typeof FAST_API_URL === 'string' && /^(https:\/\/|\/)/.test(FAST_API_URL)) ? FAST_API_URL.replace(/\/$/, '') : '';
}

async function postToBackend(payload) {
    const body = JSON.stringify(payload);
    const fast = fastApiBase();
    if (fast) {                                   // 經過加速層：成功後名額數字會立刻更新；加速層連不上就改直接送 Google（送出代碼相同，不會重複）
        try {
            const res = await fetchWithTimeout(fast + '/submit', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body }, 25000);
            return await res.json();
        } catch (err) { console.warn('[報名] 加速層連不上，改直接送出', err); }
    }
    const res = await fetchWithTimeout(SHEETS_API_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body
    }, 25000);
    return res.json();
}

/* 讀不到回應時：問後台「這組送出代碼有沒有收到？」 */
async function checkSubmission(formType, submissionId) {
    try {
        const url = `${SHEETS_API_URL}${SHEETS_API_URL.includes('?') ? '&' : '?'}action=status&form=${encodeURIComponent(formType)}&id=${encodeURIComponent(submissionId)}`;
        const res = await fetchWithTimeout(url, { redirect: 'follow', cache: 'no-store' }, 15000);
        const data = await res.json();
        return data && data.ok && data.found ? data : null;
    } catch (err) {
        return null;
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 送出（含：網路不穩時的確認與重試）。回傳 { ok, receipt?, error? } */
async function sendRegistration(formType, submissionId, fields, cfToken) {
    const payload = {
        formType,
        submissionId,
        fields,
        hp: '',                                        // 防機器人欄位，真人不會填
        cfToken: cfToken || '',                        // Cloudflare「我不是機器人」驗證結果
        elapsedMs: Date.now() - PAGE_LOADED_AT
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const data = await postToBackend(payload);
            if (data && data.ok) return { ok: true, receipt: data.receipt, category: data.category || '', position: data.position || 0 };
            if (data && data.error) return { ok: false, error: data.error };       // 後台明確拒絕（欄位太多、格式不對…）
        } catch (err) {
            // 讀不到回應：不代表沒收到。先確認一次。
        }
        await sleep(1200);
        const found = await checkSubmission(formType, submissionId);
        if (found) return { ok: true, receipt: found.receipt };
    }
    return { ok: false, error: 'network' };
}

/* 各表單共用的送出流程 ----------------------------------------------------
   form          要送出的 <form> 元素
   formType      apply / labor / service / gov / self / skill / maternity / massage
   successMessage 送出成功後原本要跳出的提醒文字
*/
const pendingSubmissionIds = new WeakMap();

async function submitRegistration(form, formType, successMessage, afterSuccess) {
    const button = form.querySelector('button[type="submit"]');

    // 後台還沒設定：維持原本行為（只跳出提醒）
    if (!isApiConfigured()) {
        console.info('[報名] js/config.js 尚未設定 SHEETS_API_URL，資料不會被記錄。');
        showSuccessModal({ message: successMessage });
        return;
    }

    if (button && button.disabled) return;
    if (!ensureHuman(form)) return;                 // 尚未勾選「我不是機器人」
    const cfToken = getTurnstileToken(form);
    const originalText = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = '資料送出中，請稍候…'; }
    // 後台偶爾要幾秒鐘才回應：超過 4 秒就改提示，讓民眾知道不是當機
    const slowHintTimer = setTimeout(() => {
        if (button && button.disabled) button.textContent = '後台處理中，請勿關閉或重新整理頁面…';
    }, 4000);

    // 同一份表單在「成功」之前，一律使用同一組送出代碼（重複按也只會有一筆）
    let submissionId = pendingSubmissionIds.get(form);
    if (!submissionId) { submissionId = newSubmissionId(); pendingSubmissionIds.set(form, submissionId); }

    try {
        const fields = collectFormData(form);
        const wantedWaitlist = !!form.querySelector('input[data-waitlist="1"]:checked');
        const result = await sendRegistration(formType, submissionId, fields, cfToken);

        if (result.ok) {
            pendingSubmissionIds.delete(form);
            form.reset();
            if (typeof afterSuccess === 'function') afterSuccess();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            // 正取／候補以「後台送出當下」的判斷為準（網頁畫面可能比後台慢幾分鐘），並在成功視窗明確告知
            let finalMessage = successMessage;
            if (result.category === '候補') {
                finalMessage = `📝 您的報名類別：【候補】${result.position ? '（第 ' + result.position + ' 位候補）' : ''}\n\n目前該梯次名額已滿，已為您登記候補。若有名額釋出，工會會依候補順序以電話或 LINE 通知您，並提供後續繳費方式，在此之前請先不要匯款。\n\n建議加入工會 LINE，方便即時查詢候補狀況。`;
            } else if (result.category === '正取') {
                finalMessage = `✅ 您的報名類別：【正取】\n\n` + (wantedWaitlist ? '您送出時剛好有名額釋出，系統已直接為您登記為正取，不需要候補。\n\n' : '') + successMessage;
            }
            showSuccessModal({ message: finalMessage, receipt: result.receipt });
            refreshBatches();                       // 名額已變動，重新讀取
        } else if (result.error === 'network') {
            alert('⚠️ 目前無法確認資料是否已送出（可能是網路不穩）。\n\n請先不要重新填寫，稍候再按一次「送出」即可（不會重複報名）。\n若仍失敗，請來電 (03) 526-5126 或加入工會 LINE 告知。');
        } else {
            alert(`⚠️ 資料沒有送出：${result.error}\n\n請檢查欄位後再試一次，或來電 (03) 526-5126 洽詢。`);
            refreshBatches();                       // 梯次可能剛額滿／截止，更新畫面
        }
    } catch (err) {
        console.error('[報名] 送出失敗', err);
        alert('⚠️ 送出時發生錯誤，請稍後再試，或來電 (03) 526-5126 洽詢。');
    } finally {
        clearTimeout(slowHintTimer);
        resetTurnstile(form);                       // 驗證碼只能用一次，送出後一律重置
        if (button) { button.disabled = false; button.textContent = originalText; }
    }
}

/* ------------------------------ 課程梯次（從試算表讀取） ------------------------------ */

const REMOTE_COURSE_TARGETS = () => ({
    gov: govCourseBatches,
    self: selfCourseBatches,
    skill: skillCourseBatches,
    maternity: maternityCourseBatches,
    massage: massageCourseBatches
});

/* 後台傳來的梯次資料整理：舊版後台可能把「否」「35」當成文字送來，
   這裡統一轉成真正的 true/false 與數字，避免「否」被當成真（= 關閉報名） */
function toBool(v) {
    if (typeof v === 'boolean') return v;
    const s = String(v == null ? '' : v).trim().toUpperCase();
    return s === 'TRUE' || s === '是' || s === 'Y' || s === 'YES' || s === '1';
}
function toNum(v) {
    if (typeof v === 'number') return v;
    if (v == null || String(v).trim() === '') return undefined;
    const n = Number(String(v).trim());
    return isNaN(n) ? undefined : n;
}
function normalizeRemoteBatch(b) {
    const item = { ...b };
    item.forceClosed = toBool(item.forceClosed);
    ['quota', 'totalQuota', 'enrolled', 'waitlistQuota', 'waitlistCount'].forEach(k => {
        const n = toNum(item[k]);
        if (n === undefined) delete item[k]; else item[k] = n;
    });
    if (item.closedReason == null) item.closedReason = '';
    return item;
}

/* 資料來源紀錄（網址後面加 ?debug=1 可在畫面左下角看到） */
const batchDebug = { source: '網站內建資料 (data.js)', reason: '尚未讀取', updatedAt: '', years: undefined, forms: undefined };

function showBatchDebug() {
    if (!/[?&]debug=1/.test(location.search)) return;
    let box = document.getElementById('batchDebugBox');
    if (!box) {
        box = document.createElement('pre');
        box.id = 'batchDebugBox';
        box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;max-width:92vw;max-height:45vh;overflow:auto;background:#111;color:#9f9;font:12px/1.4 monospace;padding:10px;border-radius:8px;white-space:pre-wrap;margin:0';
        document.body.appendChild(box);
    }
    const lines = [`資料來源：${batchDebug.source}`, `說明：${batchDebug.reason}`, `後台更新時間：${batchDebug.updatedAt || '-'}`,
        `年度設定：${batchDebug.years === undefined ? '後台沒有回傳（Code.gs 可能還沒更新並重新部署新版本）' : JSON.stringify(batchDebug.years)}`,
        `表單開關：${batchDebug.forms === undefined ? '後台沒有回傳（Code.gs 可能還沒更新並重新部署新版本）' : JSON.stringify(batchDebug.forms)}`, ''];
    const t = REMOTE_COURSE_TARGETS();
    Object.keys(t).forEach(k => t[k].forEach(b => {
        const st = getBatchStatus(b);
        lines.push(`[${k}] ${b.id}  forceClosed=${JSON.stringify(b.forceClosed)}  quota=${JSON.stringify(b.quota)}  總名額=${JSON.stringify(b.totalQuota)}  截止=${b.regEnd}  → ${st.isClosed ? '關閉' : '開放'}${st.isExpired ? '(已過期)' : ''}${st.isFull ? '(額滿)' : ''}${b.forceClosed ? '(手動關閉)' : ''}`);
    }));
    box.textContent = lines.join('\n');
}

/* 成功讀到後台資料時，用後台的梯次取代網站內建的梯次；失敗就維持內建資料。
   回傳 true 表示有更新。 */
async function loadRemoteBatches() {
    let ok = false;
    try { const r = await loadRemoteBatchesCore(); ok = !!r; return r; }
    finally {
        document.documentElement.classList.remove('pending-remote');   // 後台回應（或失敗）後，才顯示年度與金額
        if (typeof applyCourseFees === 'function') { try { applyCourseFees(); } catch (e) {} }
        if (ok && typeof saveCourseFeeCache === 'function') saveCourseFeeCache();
    }
}

async function loadRemoteBatchesCore() {
    if (!isApiConfigured()) {
        batchDebug.reason = 'js/config.js 的 SHEETS_API_URL 是空的，所以只用內建資料';
        showBatchDebug();
        return false;
    }
    try {
        const url = `${SHEETS_API_URL}${SHEETS_API_URL.includes('?') ? '&' : '?'}action=batches`;
        let data;
        if (window.__earlyBatches) {                       // 頁首已提早送出請求，直接接手結果（不重複等待）
            const early = window.__earlyBatches; window.__earlyBatches = null;
            try { data = await early; } catch (e) { data = undefined; }
            if (!data || data.ok !== true) data = undefined;
        }
        if (!data) {                                       // 提早請求沒成功（或沒有）：再試一次；有加速層先試加速層，不行再直接問 Google
            const fast = fastApiBase();
            if (fast) {
                try { data = await (await fetchWithTimeout(fast + '/batches', { cache: 'no-store' }, 5000)).json(); } catch (e) { data = undefined; }
                if (!data || data.ok !== true) data = undefined;
            }
        }
        if (!data) {
            const res = await fetchWithTimeout(url, { redirect: 'follow', cache: 'no-store' }, 8000);
            data = await res.json();
        }
        if (data && data.ok === true) {
            batchDebug.years = data.years;
            batchDebug.forms = data.forms;
            if (data.years && typeof applyCourseYears === 'function') applyCourseYears(data.years);   // 各課程年度：後台「年度設定」分頁
            if (data.forms && typeof applyFormSwitches === 'function') applyFormSwitches(data.forms); // 表單開關：後台「表單開關」分頁
            if (Array.isArray(data.news) && typeof applySiteNews === 'function') applySiteNews(data.news);   // 最新公告：後台「最新公告」分頁
        }
        if (!data || data.ok !== true || typeof data.courses !== 'object') {
            batchDebug.reason = '後台有回應但格式不對：' + JSON.stringify(data).slice(0, 200);
            showBatchDebug();
            return false;
        }

        const targets = REMOTE_COURSE_TARGETS();
        let changed = false;
        Object.keys(targets).forEach(key => {
            const remote = data.courses[key];
            if (Array.isArray(remote) && remote.length > 0) {
                targets[key].splice(0, targets[key].length, ...remote.map(normalizeRemoteBatch));   // 原地取代，其他程式引用的陣列不會失效
                changed = true;
            }
        });
        batchDebug.source = changed ? 'Google 試算表（後台）' : '網站內建資料 (data.js)';
        batchDebug.reason = changed ? '讀取成功' : '後台有回應，但「課程梯次」分頁沒有任何可顯示的梯次（請確認分頁名稱必須是「課程梯次」）';
        batchDebug.updatedAt = data.updatedAt || '';
        showBatchDebug();
        return changed;
    } catch (err) {
        console.warn('[課程梯次] 無法從後台讀取，改用網站內建資料。', err);
        batchDebug.reason = '連線失敗：' + (err && err.message ? err.message : err) + '（網址錯誤、部署權限不是「所有人」，或網路逾時）';
        showBatchDebug();
        return false;
    }
}

/* ------------------------------ 入會／勞健保／月子服務需求 ------------------------------ */
function submitApplyForm(form) {
    submitRegistration(form, 'apply', '入會申請資料已成功送出！工會專員將會於上班時間主動與您聯繫確認。', () => toggleDepBox(false));
}

function submitLaborForm(form) {
    submitRegistration(form, 'labor', '勞健保異動申請資料已成功送出！工會專員將於上班時間主動與您聯繫確認。');
}

function submitServiceApplyForm(form) {
    submitRegistration(form, 'service', '已成功送出月子服務需求單！工會督導專員將於上班時間主動與您聯繫確認。');
}
