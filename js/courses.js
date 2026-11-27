/* ==========================================================================
   courses.js — 課程梯次顯示（簡章表格＋報名選項）與報名表送出
   梯次資料在 data.js。五種課程共用下方的小工具，各自只保留版面差異。
   ========================================================================== */

/* ------------------------------ 共用小工具 ------------------------------ */

/* "2026-03-25 23:30" → Date（把 - 換成 / 以相容 Safari） */
function parseRegDate(str) {
    return new Date(String(str).replace(/-/g, '/'));
}

/* ==========================================================================
   各課程的「年度」（民國年）
   網頁上所有年度文字都寫成 <span data-year="課程代碼">115</span>，由後台試算表
   「年度設定」分頁統一控制，工作人員不需要改 HTML。
   課程代碼：gov / self / skill / maternity / massage
   ========================================================================== */
const COURSE_YEARS = {};
const COURSE_YEARS_CACHE_KEY = 'hcmccuCourseYears';

/* 取得某課程目前的民國年度（後台有設定用後台的，否則用網頁上原本寫的數字） */
function courseYear(key) {
    if (COURSE_YEARS[key]) return COURSE_YEARS[key];
    const el = document.querySelector(`[data-year="${key}"]`);
    const n = el ? parseInt(el.textContent, 10) : NaN;
    return n || '';
}

/* 把年度套用到網頁上所有 data-year（民國）與 data-year-ad（西元）標記 */
function applyCourseYears(years, save = true) {
    if (!years || typeof years !== 'object') return;
    const valid = {};
    Object.keys(years).forEach(key => {
        const y = parseInt(years[key], 10);
        if (!(y >= 100 && y <= 300)) return;
        valid[key] = y;
        COURSE_YEARS[key] = y;
        document.querySelectorAll(`[data-year="${key}"]`).forEach(el => { el.textContent = y; });
        document.querySelectorAll(`[data-year-ad="${key}"]`).forEach(el => { el.textContent = y + 1911; });
    });
    if (save) {                                   // 只記住後台這次實際給的年度（後台沒給的課程不會被舊紀錄卡住）
        try {
            if (Object.keys(valid).length) localStorage.setItem(COURSE_YEARS_CACHE_KEY, JSON.stringify(valid));
            else localStorage.removeItem(COURSE_YEARS_CACHE_KEY);
        } catch (e) { /* 忽略 */ }
    }
}

/* 最新公告：後台「最新公告」分頁有資料時，取代 news.js 內建的公告（並記住，下次開網頁立刻顯示） */
const NEWS_CACHE_KEY = 'hcmccuNews';
function applySiteNews(list, save = true) {
    if (!Array.isArray(list) || typeof siteNews === 'undefined' || !Array.isArray(siteNews)) return;
    const clean = list.filter(n => n && n.title && n.date).map(n => ({
        date: String(n.date), title: String(n.title), image: n.image || '', images: Array.isArray(n.images) ? n.images : undefined, content: String(n.content || ''),
        link: n.link || undefined, linkText: n.linkText || undefined, anchor: n.anchor || undefined
    }));
    siteNews.splice(0, siteNews.length, ...clean);
    if (save) { try { localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(clean)); } catch (e) { /* 忽略 */ } }
    if (save && typeof renderNewsCards === 'function' && document.getElementById('newsSliderContainer')) {
        try { renderNewsCards(); } catch (e) { console.error('[公告] 重新顯示失敗', e); }
    }
}
try {                                   // 這支程式在頁面開始渲染之前執行：先套用上次記住的公告
    const cachedNews = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY) || 'null');
    if (Array.isArray(cachedNews) && cachedNews.length) applySiteNews(cachedNews, false);
} catch (e) { /* 忽略 */ }

/* 開啟頁面時先套用上次記住的年度，避免畫面先顯示舊年度、讀到後台資料才跳成新年度 */
document.addEventListener('DOMContentLoaded', () => {
    try {
        const cached = JSON.parse(localStorage.getItem(COURSE_YEARS_CACHE_KEY) || 'null');
        if (cached) applyCourseYears(cached, false);
    } catch (e) { /* 忽略 */ }
});

/* ==========================================================================
   費用（由後台「課程梯次」分頁的「費用」欄同步到各報名表）
   網頁上的金額寫成 <span data-fee="課程代碼">原價</span>、
   <span data-fee-disc="課程代碼">9折價</span>。
   工會人員只要改試算表的「費用」，9 折金額自動換算（四捨五入到整數元）。
   試算表沒填費用的課程，網頁維持原本寫的金額。
   ========================================================================== */
const MEMBER_DISCOUNT_RATE = 0.9;
const COURSE_FEES_CACHE_KEY = 'hcmccuCourseFees';
const COURSE_CACHE_AT_KEY = 'hcmccuCacheAt';
const FEE_COURSE_KEYS = ['gov', 'self', 'skill', 'maternity', 'massage'];
const BATCH_RADIO_COURSE = {
    gov_selected_batch: 'gov', self_selected_batch: 'self', skill_selected_batch: 'skill',
    mat_selected_batch: 'maternity', massage_selected_batch: 'massage'
};

function parseFeeAmount(v) {
    if (typeof v === 'number') return v > 0 ? v : null;
    const m = String(v == null ? '' : v).match(/\d[\d,]*(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0].replace(/,/g, ''));
    return n > 0 ? n : null;
}
const formatMoney = n => Math.round(n).toLocaleString('en-US');
const discountedFee = n => Math.round(n * MEMBER_DISCOUNT_RATE);

function courseBatchList(key) {
    const lists = { gov: govCourseBatches, self: selfCourseBatches, skill: skillCourseBatches, maternity: maternityCourseBatches, massage: massageCourseBatches };
    return lists[key] || [];
}

function feeForCourse(key) {
    const list = courseBatchList(key);
    const radioName = Object.keys(BATCH_RADIO_COURSE).find(n => BATCH_RADIO_COURSE[n] === key);
    const picked = radioName && document.querySelector(`input[name="${radioName}"]:checked`);
    const selected = picked && list.find(b => b.id === picked.value);
    let amount = selected ? parseFeeAmount(selected.fee) : null;
    if (!amount) {
        const open = list.find(b => parseFeeAmount(b.fee) && !getBatchStatus(b).isClosed);
        amount = open ? parseFeeAmount(open.fee) : null;
    }
    if (!amount) {
        const any = list.find(b => parseFeeAmount(b.fee));
        amount = any ? parseFeeAmount(any.fee) : null;
    }
    return amount;
}

function applyCourseFees() {
    FEE_COURSE_KEYS.forEach(key => {
        const amount = feeForCourse(key);
        if (!amount) return;
        document.querySelectorAll(`[data-fee="${key}"]`).forEach(el => { el.textContent = formatMoney(amount); });
        document.querySelectorAll(`[data-fee-disc="${key}"]`).forEach(el => { el.textContent = formatMoney(discountedFee(amount)); });
    });
}

function paintCourseFees(amounts) {
    Object.keys(amounts).forEach(key => {
        const amount = amounts[key];
        if (!amount) return;
        document.querySelectorAll(`[data-fee="${key}"]`).forEach(el => { el.textContent = formatMoney(amount); });
        document.querySelectorAll(`[data-fee-disc="${key}"]`).forEach(el => { el.textContent = formatMoney(discountedFee(amount)); });
    });
}

/* 後台讀取成功後，記住這次的年度與金額，下次開頁面可立刻顯示 */
function saveCourseFeeCache() {
    try {
        const amounts = {};
        FEE_COURSE_KEYS.forEach(k => { const a = feeForCourse(k); if (a) amounts[k] = a; });
        localStorage.setItem(COURSE_FEES_CACHE_KEY, JSON.stringify(amounts));
        localStorage.setItem(COURSE_CACHE_AT_KEY, String(Date.now()));
    } catch (e) { /* 忽略 */ }
}

/* 開啟頁面時先套用上次記住的金額 */
document.addEventListener('DOMContentLoaded', () => {
    try {
        const cached = JSON.parse(localStorage.getItem(COURSE_FEES_CACHE_KEY) || 'null');
        if (cached) paintCourseFees(cached);
    } catch (e) { /* 忽略 */ }
});

document.addEventListener('change', e => {
    const t = e.target;
    if (t && t.name && BATCH_RADIO_COURSE[t.name]) applyCourseFees();
});

/* 尚餘名額文字：有數字就顯示數字；沒設定名額＝不限 */
function remainingText(batch) {
    return typeof batch.quota === 'number' ? batch.quota : '不限';
}

/* 梯次狀態：手動關閉 / 已過截止時間 / 名額用完 → 皆視為關閉
   截止時間缺漏或格式錯誤時，不當作已截止（避免整個梯次被誤鎖） */
function getBatchStatus(batch, useQuota = true) {
    const end = batch.regEnd ? parseRegDate(batch.regEnd) : null;
    const isExpired = Boolean(end) && !isNaN(end.getTime()) && new Date() > end;
    const isFull = useQuota && typeof batch.quota === 'number' && batch.quota <= 0;
    return { isExpired, isFull, isClosed: Boolean(batch.forceClosed) || isExpired || isFull };
}

/* ==========================================================================
   候補：梯次額滿後，後台「課程梯次」的「候補名額」有填數字（>0）就開放登記候補
   - 額滿的梯次仍可選取，標示「額滿・登記候補（目前候補 N 人）」
   - 候補人數達到「候補名額」上限後，顯示「候補已額滿」
   - 手動關閉、已截止的梯次不開放候補
   ========================================================================== */
function waitlistState(batch) {
    const s = getBatchStatus(batch);
    const quota = typeof batch.waitlistQuota === 'number' ? batch.waitlistQuota : 0;
    const count = typeof batch.waitlistCount === 'number' ? batch.waitlistCount : 0;
    const enabled = quota > 0 && s.isFull && !batch.forceClosed && !s.isExpired;
    return { enabled, quota, count, open: enabled && count < quota };
}

function waitlistNoteText(w) {
    return w.open
        ? `名額已滿，可登記候補（目前候補 ${w.count} 人／上限 ${w.quota} 人）`
        : `名額已滿，候補也已額滿（候補 ${w.count} 人）`;
}

/* 額滿的梯次：把選項改成可選的「登記候補」，簡章列加註候補人數 */
function applyWaitlistUi() {
    Object.keys(BATCH_RADIO_COURSE).forEach(name => {
        const key = BATCH_RADIO_COURSE[name];
        courseBatchList(key).forEach(batch => {
            const w = waitlistState(batch);
            if (!w.enabled) return;
            const radio = Array.from(document.querySelectorAll(`input[name="${name}"]`)).find(r => r.value === batch.id);
            if (radio) {
                const label = radio.closest('label');
                if (w.open) {
                    radio.disabled = false;
                    radio.required = true;
                    radio.dataset.waitlist = '1';
                    if (label) label.className = 'block p-3.5 rounded-lg border transition-all bg-amber-50 border-amber-300 hover:border-amber-500 cursor-pointer';
                }
                if (label && !label.querySelector('[data-waitlist-note]')) {
                    const note = document.createElement('div');
                    note.setAttribute('data-waitlist-note', '1');
                    note.setAttribute('data-no-key', '');
                    note.className = 'text-xs font-bold mt-1 ' + (w.open ? 'text-amber-700' : 'text-slate-500');
                    note.style.marginLeft = '1.75rem';
                    note.textContent = (w.open ? '📝 ' : '') + waitlistNoteText(w) + (w.open ? '。選此項即為「登記候補」，有名額釋出時工會會依序通知。' : '');
                    (radio.closest('label') || label).appendChild(note);
                }
            }
            const row = document.querySelector(`tr[data-batch-id="${batch.id}"]`);
            if (row && !row.querySelector('[data-waitlist-note]')) {
                if (w.open) row.className = row.className.replace(/bg-slate-50|text-slate-400/g, '').trim();
                const cell = row.querySelector('td');
                if (cell) {
                    const note = document.createElement('div');
                    note.setAttribute('data-waitlist-note', '1');
                    note.className = 'text-xs font-bold mt-1 font-normal ' + (w.open ? 'text-amber-700' : 'text-slate-500');
                    note.textContent = (w.open ? '可登記候補' : '候補已額滿') + `（候補 ${w.count} 人${w.quota ? '／上限 ' + w.quota + ' 人' : ''}）`;
                    cell.appendChild(note);
                }
            }
        });
    });
}

/* 狀態徽章 */
const BADGE_COLORS = {
    open:    'bg-green-100 text-green-800',
    stopped: 'bg-red-100 text-red-800',
    ended:   'bg-red-100 text-red-700',
    expired: 'bg-slate-200 text-slate-600'
};
function statusBadge(kind, label) {
    return `<span class="${BADGE_COLORS[kind]} text-xs font-bold px-2.5 py-1 rounded-full">${label}</span>`;
}

/* 簡章表格列樣式：關閉的梯次整列反灰 */
function rowClass(isClosed, hoverColor = 'hover:bg-orange-50/30') {
    return isClosed ? 'bg-slate-50 text-slate-400' : hoverColor;
}

/* 報名選項（radio 外框）樣式。closedOpacity 為各課程原本的透明度 */
function optionLabelClass(isClosed, closedOpacity, hoverBorder = 'hover:border-[#d96b43]') {
    const state = isClosed
        ? `bg-slate-100 border-slate-200 ${closedOpacity} cursor-not-allowed`
        : `bg-white border-slate-300 ${hoverBorder} cursor-pointer`;
    return `block p-3.5 rounded-lg border transition-all ${state}`;
}

/* 取得兩個容器；任一不存在（頁面沒有該課程）就回傳 null */
function getBatchContainers(tableBodyId, optionsId) {
    const tableBody = document.getElementById(tableBodyId);
    const options = document.getElementById(optionsId);
    return (tableBody && options) ? { tableBody, options } : null;
}

/* ------------------------------ 職訓補助班 ------------------------------ */
function renderGovCourseBatches() {
    const box = getBatchContainers('govCourseSyllabusTableBody', 'govCourseBatchOptions');
    if (!box) return;

    let tableHtml = '';
    let optionsHtml = '';

    govCourseBatches.forEach(batch => {
        const { isExpired, isFull, isClosed } = getBatchStatus(batch);

        let badge = statusBadge('open', '開放報名中');
        let statusNote = `尚餘名額：${remainingText(batch)}`;
        if (batch.forceClosed) {
            badge = statusBadge('stopped', '停止招生');
            statusNote = batch.closedReason;
        } else if (isExpired) {
            badge = statusBadge('expired', '時間結束');
            statusNote = '已超過報名截止時間';
        } else if (isFull) {
            badge = statusBadge('ended', '名額已滿');
            statusNote = '報名名額已滿';
        }

        tableHtml += `
            <tr data-batch-id="${batch.id}" class="${rowClass(isClosed, 'hover:bg-blue-50/30')}">
                <td class="px-4 py-3 font-bold ${isClosed ? '' : 'text-slate-800'}">${batch.name}</td>
                <td class="px-4 py-3">${batch.period}</td>
                <td class="px-4 py-3 font-medium">預定 ${batch.examDate}</td>
                <td class="px-4 py-3 text-xs">${batch.regStart} 至<br><strong>${batch.regEnd}</strong></td>
                <td class="px-4 py-3 text-center">
                    ${badge}
                    ${batch.forceClosed ? `<div class="text-[11px] text-red-600 font-bold mt-1">${batch.closedReason}</div>` : ''}
                </td>
            </tr>`;

        optionsHtml += `
            <label class="${optionLabelClass(isClosed, 'opacity-65', 'hover:border-[#2b6cb0]')}">
                <div class="flex items-start">
                    <input type="radio" name="gov_selected_batch" value="${batch.id}" ${isClosed ? 'disabled' : 'required'} class="accent-[#2b6cb0] mt-1 mr-3 w-4 h-4">
                    <div>
                        <div class="font-bold text-sm ${isClosed ? 'text-slate-500' : 'text-slate-800'}">
                            ${batch.shortLabel}
                            <span class="text-xs font-normal text-slate-500">(${isClosed ? (batch.forceClosed ? '已額滿/停止招生' : (isFull && !isExpired ? '名額已滿' : '時間結束')) : statusNote})</span>
                        </div>
                        ${batch.forceClosed ? `<div class="text-xs text-red-600 font-bold mt-1">${batch.closedReason}</div>` : ''}
                        <div class="text-xs text-slate-500 mt-1">
                            <span class="${isClosed ? 'text-red-500 font-bold' : 'text-green-700 font-bold'}">(${isClosed ? ((isFull && !isExpired && !batch.forceClosed) ? '名額已滿' : '時間結束') : '開放報名'})</span>
                            報名期間 <span class="text-red-600">${batch.regStart}</span> 至 <span class="text-red-600">${batch.regEnd}</span>
                        </div>
                    </div>
                </div>
            </label>`;
    });

    box.tableBody.innerHTML = tableHtml;
    box.options.innerHTML = optionsHtml;
}

/* ------------------------------ 市府委訓自費班 ------------------------------ */
function renderSelfCourseBatches() {
    const box = getBatchContainers('selfCourseSyllabusTableBody', 'selfCourseBatchOptions');
    if (!box) return;

    let tableHtml = '';
    let optionsHtml = '';

    selfCourseBatches.forEach((batch, index) => {
        const { isExpired, isFull, isClosed } = getBatchStatus(batch);

        let badge = statusBadge('open', '開放報名中');
        let statusText = `<span class="text-red-600 font-bold">(尚餘: ${remainingText(batch)})</span>`;
        if (batch.forceClosed) {
            badge = statusBadge('stopped', '已額滿/停止招生');
            statusText = `<span class="text-red-600 font-bold">(${batch.closedReason || '已額滿'})</span>`;
        } else if (isExpired) {
            badge = statusBadge('expired', '報名截止');
            statusText = '<span class="text-red-600 font-bold">(報名截止)</span>';
        } else if (isFull) {
            badge = statusBadge('stopped', '名額已滿');
            statusText = '<span class="text-red-600 font-bold">(名額已滿)</span>';
        }

        tableHtml += `
            <tr data-batch-id="${batch.id}" class="${rowClass(isClosed)}">
                <td class="px-4 py-3 font-bold ${isClosed ? '' : 'text-slate-800'}">${batch.name}</td>
                <td class="px-4 py-3">${batch.period}</td>
                <td class="px-4 py-3 font-bold text-[#d96b43]">${batch.fee}</td>
                <td class="px-4 py-3 text-xs">即日起至 <strong>${batch.regEnd}</strong></td>
                <td class="px-4 py-3 text-center">${badge}</td>
            </tr>`;

        optionsHtml += `
            <label class="${optionLabelClass(isClosed, 'opacity-65')}">
                <div class="flex items-center">
                    <input type="radio" name="self_selected_batch" value="${batch.id}" ${isClosed ? 'disabled' : (index === 0 ? 'checked required' : 'required')} class="accent-[#d96b43] mr-3 w-4 h-4">
                    <div class="text-sm font-bold ${isClosed ? 'text-slate-500' : 'text-slate-800'}">
                        ${batch.shortLabel} ${statusText}
                    </div>
                </div>
            </label>`;
    });

    box.tableBody.innerHTML = tableHtml;
    box.options.innerHTML = optionsHtml;
}

/* ------------------------------ 保母術科加強班 ------------------------------ */
function renderSkillCourseBatches() {
    const box = getBatchContainers('skillCourseSyllabusTableBody', 'skillCourseBatchOptions');
    if (!box) return;

    let tableHtml = '';
    let optionsHtml = '';

    skillCourseBatches.forEach(batch => {
        const { isExpired, isFull, isClosed } = getBatchStatus(batch);

        let badge = statusBadge('open', '開放報名中');
        let quotaText = `<span class="text-red-600 font-bold">(尚餘: ${remainingText(batch)})</span>`;
        if (batch.forceClosed) {
            badge = statusBadge('stopped', '停止招生');
            quotaText = `<span class="text-red-600 font-bold">(${batch.closedReason || '已額滿'})</span>`;
        } else if (isExpired) {
            badge = statusBadge('expired', '報名截止');
            quotaText = '<span class="text-red-600 font-bold">(報名截止)</span>';
        } else if (isFull) {
            badge = statusBadge('stopped', '名額已滿');
            quotaText = '<span class="text-red-600 font-bold">(名額已滿)</span>';
        }

        tableHtml += `
            <tr data-batch-id="${batch.id}" class="${rowClass(isClosed)}">
                <td class="px-4 py-3 font-bold ${isClosed ? '' : 'text-slate-800'}">${batch.name}</td>
                <td class="px-4 py-3 font-bold text-blue-700">${batch.dates}</td>
                <td class="px-4 py-3 text-xs">截止至 <strong>${batch.regEnd}</strong></td>
                <td class="px-4 py-3 text-center">${badge}</td>
            </tr>`;

        optionsHtml += `
            <label class="${optionLabelClass(isClosed, 'opacity-65')}">
                <div class="flex items-center">
                    <input type="radio" name="skill_selected_batch" value="${batch.id}" ${isClosed ? 'disabled' : 'required'} class="accent-[#d96b43] mr-3 w-4 h-4">
                    <div class="text-sm font-bold ${isClosed ? 'text-slate-500' : 'text-slate-800'}">
                        ${batch.name} ${batch.dates} ${quotaText}
                    </div>
                </div>
            </label>`;
    });

    box.tableBody.innerHTML = tableHtml;
    box.options.innerHTML = optionsHtml;
}

function toggleSkillBankInput(isRequired) {
    const bankInput = document.getElementById('skillBankLast5');
    if (!bankInput) return;
    bankInput.required = isRequired;
    if (isRequired) bankInput.focus();
}

/* ------------------------------ 月子專業培訓（職前訓練） ------------------------------
   只有報名選項與頂部徽章，沒有簡章表格；全部梯次截止時鎖住送出按鈕 */
function renderMaternityCourseBatches() {
    const optionsContainer = document.getElementById('maternityCourseBatchOptions');
    const topBadge = document.getElementById('maternityTopStatusBadge');
    const submitBtn = document.getElementById('maternitySubmitBtn');
    if (!optionsContainer) return;

    let optionsHtml = '';
    let hasOpenBatch = false;

    maternityCourseBatches.forEach(batch => {
        const { isExpired, isFull, isClosed } = getBatchStatus(batch);
        if (!isClosed) hasOpenBatch = true;

        optionsHtml += `
            <label class="${optionLabelClass(isClosed, 'opacity-75')}">
                <div class="flex items-center">
                    <input type="radio" name="mat_selected_batch" value="${batch.id}" ${isClosed ? 'disabled' : 'checked required'} class="accent-[#d96b43] mr-3 w-4 h-4">
                    <div class="text-sm font-bold ${isClosed ? 'text-slate-500' : 'text-slate-800'}">
                        ${batch.name} ${batch.dates} <span class="text-red-600 text-xs font-bold">(${typeof batch.quota === 'number' ? `總量 ${batch.totalQuota ?? '-'}，尚餘 ${batch.quota}` : `總量 ${batch.totalQuota ?? '不限'}`})</span>
                        ${isClosed ? `<span class="ml-2 text-xs text-red-600 font-bold">(${batch.forceClosed ? (batch.closedReason || '報名截止') : (isExpired ? '報名截止' : '名額已滿')})</span>` : ''}
                    </div>
                </div>
            </label>`;
    });

    optionsContainer.innerHTML = optionsHtml;

    if (topBadge) {
        topBadge.innerHTML = hasOpenBatch
            ? statusBadge('open', '開放報名中')
            : statusBadge('ended', '(報名截止)');
    }

    if (submitBtn) {
        // 記住按鈕原本的樣子：梯次資料更新（例如在試算表開放新一期）後，要能恢復成可按的狀態
        if (!submitBtn.dataset.origText) {
            submitBtn.dataset.origText = submitBtn.textContent;
            submitBtn.dataset.origClass = submitBtn.className;
        }
        if (hasOpenBatch) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.origText;
            submitBtn.className = submitBtn.dataset.origClass;
        } else {
            submitBtn.disabled = true;
            submitBtn.textContent = '目前梯次已報名截止（新梯次籌備中）';
            submitBtn.className = 'w-full py-4 bg-slate-400 text-white text-base font-bold rounded-xl cursor-not-allowed';
        }
    }
}

/* ------------------------------ 嬰幼兒按摩證書班 ------------------------------ */
function renderMassageCourseBatches() {
    const box = getBatchContainers('massageCourseSyllabusTableBody', 'massageCourseBatchOptions');
    if (!box) return;

    let tableHtml = '';
    let optionsHtml = '';

    massageCourseBatches.forEach(batch => {
        const { isExpired, isFull, isClosed } = getBatchStatus(batch);

        let badge = statusBadge('open', '開放報名中');
        let subStatusHtml = `<div class="text-xs text-red-700 mt-1">› 報名期間 ${batch.regStart} 至 ${batch.regEnd}</div>`;
        let quotaColor = 'text-red-600';

        if (batch.forceClosed) {
            badge = statusBadge('stopped', '停止招生');
            subStatusHtml = `<div class="text-xs text-red-600 mt-1">(停止招生) › ${batch.closedReason || '已額滿'}</div>`;
            quotaColor = 'text-slate-400';
        } else if (isExpired) {
            badge = statusBadge('expired', '時間結束');
            subStatusHtml = `<div class="text-xs text-slate-500 mt-1"><span class="text-red-600 font-bold">(時間結束)</span> › 報名期間 ${batch.regStart} 至 ${batch.regEnd}</div>`;
            quotaColor = 'text-slate-400';
        } else if (isFull) {
            badge = statusBadge('stopped', '名額已滿');
            subStatusHtml = `<div class="text-xs text-slate-500 mt-1"><span class="text-red-600 font-bold">(名額已滿)</span> › 報名期間 ${batch.regStart} 至 ${batch.regEnd}</div>`;
            quotaColor = 'text-slate-400';
        }

        tableHtml += `
            <tr data-batch-id="${batch.id}" class="${rowClass(isClosed)}">
                <td class="px-4 py-3 font-bold ${isClosed ? '' : 'text-slate-800'}">${batch.name}</td>
                <td class="px-4 py-3 font-bold ${isClosed ? '' : 'text-blue-700'}">${batch.dateText}</td>
                <td class="px-4 py-3 text-xs">${batch.regStart} ～ ${batch.regEnd}</td>
                <td class="px-4 py-3 text-center">${badge}</td>
            </tr>`;

        optionsHtml += `
            <label class="${optionLabelClass(isClosed, 'opacity-70')}">
                <div class="flex items-start">
                    <input type="radio" name="massage_selected_batch" value="${batch.id}" ${isClosed ? 'disabled' : 'required'} class="accent-[#d96b43] mt-1 mr-3 w-4 h-4">
                    <div>
                        <div class="text-sm font-bold ${isClosed ? 'text-slate-500' : 'text-slate-800'}">
                            ${batch.name} ${batch.dateText} <span class="${quotaColor} text-xs font-bold">(尚餘: ${remainingText(batch)})</span>
                        </div>
                        ${subStatusHtml}
                    </div>
                </div>
            </label>`;
    });

    box.tableBody.innerHTML = tableHtml;
    box.options.innerHTML = optionsHtml;
}

function toggleMassageOtherInput(isTransfer) {
    const otherInput = document.getElementById('massageOtherOrBankInput');
    if (!otherInput) return;

    otherInput.required = isTransfer;
    if (isTransfer) {
        otherInput.placeholder = '必填：請輸入匯款銀行帳號末 5 碼';
        otherInput.focus();
    } else {
        otherInput.placeholder = '請填寫匯款帳號末 5 碼或備註';
    }
}

/* ------------------------------ 選單進入課程頁時的截止提醒 ------------------------------ */

/* 課程代碼 → 顯示名稱與梯次資料（新增課程時在這裡加一行） */
const COURSES = {
    gov:       { label: '托育(保母)職訓補助班', batches: govCourseBatches,       useQuota: true },
    self:      { label: '托育(保母)市府自費班', batches: selfCourseBatches,      useQuota: true },
    skill:     { label: '保母術科加強班',       batches: skillCourseBatches,     useQuota: true },
    maternity: { label: '月子人員培訓課程',     batches: maternityCourseBatches, useQuota: true },
    massage:   { label: '嬰幼兒按摩課程',       batches: massageCourseBatches,   useQuota: true }
};

/* 該課程的所有梯次是否都已關閉（逾期／手動關閉／額滿） */
function isCourseAllClosed(batches, useQuota = true) {
    if (!batches || batches.length === 0) return true;
    return batches.every(b => getBatchStatus(b, useQuota).isClosed && !waitlistState(b).open);   // 可登記候補的梯次不算「全部關閉」
}

/* 若該課程所有梯次皆已截止，先跳提醒，仍照常顯示簡章與報名表 */
function navigateToCourse(urlPath, sectionId, courseKey) {
    const course = COURSES[courseKey];
    const alertMsg = (course && isCourseAllClosed(course.batches, course.useQuota !== false))
        ? `⚠️ 提醒：本年度「${course.label}」目前所有梯次皆已報名截止，新年度課表籌備中！\n\n您仍可先瀏覽下方招生簡章與訓練資訊。`
        : null;
    navigateTo(urlPath, sectionId, null, alertMsg);
}

/* ------------------------------ 報名表送出 ------------------------------ */

/* 銀行匯款／LINE 提醒文字（術科班與按摩班共用） */
function bankTransferReminder(courseTitle) {
    return `${courseTitle}報名資料已送出！\n\n` +
        `⚠️ 重要提醒：若您選擇銀行匯款，請確認已完成轉帳至${CONTACT.bank}，` +
        `並透過電話 (${CONTACT.phone}) 或工會 LINE (ID：${CONTACT.unionLineId}) 告知轉帳帳號末 5 碼，專員核對後即完成報名確認！`;
}

function submitGovCourseForm() {
    submitRegistration(document.getElementById('govCourseForm'), 'gov',
        `${courseYear('gov')}年度托育職訓補助班報名資料已送出！\n\n⚠️ 重要提醒：請務必立即加入工會 LINE（ID：${CONTACT.unionLineId}），鍵入「您的姓名＋報名班次」，專員將傳送繳費帳號給您，7日內完成繳費才算報名成功喔！`);
}

function submitSelfCourseForm() {
    submitRegistration(document.getElementById('selfCourseForm'), 'self',
        `${courseYear('self')}年度托育市府委訓自費班報名資料已送出！\n\n⚠️ 重要提醒：請務必加入工會 LINE（ID：${CONTACT.unionLineId}）並留言「您的全名及報名班次」，收到匯款帳號後繳費完成才算報名成功（依繳費順序入訓）。`);
}

function submitSkillCourseForm() {
    submitRegistration(document.getElementById('skillCourseForm'), 'skill',
        bankTransferReminder(`${courseYear('skill')}年度保母術科模考加強班`), () => toggleSkillBankInput(false));
}

function submitMassageCourseForm() {
    submitRegistration(document.getElementById('massageCourseForm'), 'massage',
        bankTransferReminder(`${courseYear('massage')}年嬰幼兒按摩證書班`), () => toggleMassageOtherInput(false));
}

function submitMaternityCourseForm() {
    // 驗證：工作履歷至少勾選一項
    if (document.querySelectorAll('.mat-job-chk:checked').length === 0) {
        alert('請至少勾選一項「之前擔任的工作履歷」！');
        return;
    }

    // 驗證：可服務區域（新竹市必選 2 個，且總計至少勾選 3 項）
    const cityChecked = document.querySelectorAll('.mat-hsinchu-city:checked').length;
    const totalAreaChecked = document.querySelectorAll('.mat-area-chk:checked').length;
    if (cityChecked < 2 || totalAreaChecked < 3) {
        alert('⚠️「可服務區域範圍」填寫未完整：\n1. 新竹市（東區、北區、香山區）至少必須勾選 2 個區域！\n2. 全部可服務區域總計至少需勾選 3 項！');
        return;
    }

    submitRegistration(document.getElementById('maternityCourseForm'), 'maternity',
        `${courseYear('maternity')}年 月子專業培訓（職前訓練）報名資料已送出！\n\n⚠️ 重要提醒：請務必立即加入月子平台 LINE（ID：${CONTACT.maternityLineId}），傳送「您的姓名＋已報名月子培訓」，並拍照上傳良民證、體檢證明、托育證照等應備文件，審核通過並完成繳費後才算確認報名喔！`);
}

/* 重新顯示五種課程的梯次（從試算表讀到新資料之後會呼叫） */
function renderAllCourseBatches() {
    [renderGovCourseBatches, renderSelfCourseBatches, renderSkillCourseBatches,
     renderMaternityCourseBatches, renderMassageCourseBatches].forEach(fn => {
        try { fn(); } catch (err) { console.error('[課程梯次] 顯示失敗：' + fn.name, err); }
    });
    try { applyWaitlistUi(); } catch (err) { console.error('[候補] 顯示失敗', err); }
    try { applyCourseFees(); } catch (err) { console.error('[課程費用] 同步失敗', err); }
}

/* 重新向後台讀取梯次並更新畫面（報名成功或被拒絕後呼叫，讓「尚餘名額」立刻更新） */
function refreshBatches() {
    if (typeof loadRemoteBatches !== 'function') return;
    loadRemoteBatches().then(changed => { if (changed) renderAllCourseBatches(); }).catch(() => {});
}
