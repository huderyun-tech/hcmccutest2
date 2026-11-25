/* ==========================================================================
   app.js — 單頁路由、最新消息、共用表單工具、頁面初始化
   （資料請改 data.js；課程報名邏輯在 courses.js；試算在 calculator.js）
   ========================================================================== */

/* 路由表：網址 → 區塊 id。新增頁面時，在這裡加一行即可 ----------------- */
const ROUTES = {
    '/':                   'home-section',
    '/mission':            'mission-section',
    '/apply':              'apply-section',
    '/labor':              'labor-section',
    '/service':            'service-section',
    '/service-apply':      'service-apply-section',
    '/course-nanny-gov':   'course-nanny-gov-section',
    '/course-nanny-self':  'course-nanny-self-section',
    '/course-nanny-skill': 'course-nanny-skill-section',
    '/course-maternity':   'course-maternity-section',
    '/course-massage':     'course-massage-section',
    '/fee':                'fee-section',
    '/rates':              'rates-section',
    '/exam':               'exam-section',
   '/mock-exam':          'mock-exam-section'
};

const APPLY_NOTICE =
    '如有需要加保工會可以先填寫申請表單，並於加保日期前至工會辦理入會手續，攜帶:\n' +
    '1吋或2吋證件照片一張，身分證正反面影本一份，托育相關證書證照影本一份，印章，' +
    '如需加保眷屬需攜帶戶口名簿影本一份，入會費1000元，以上文件前來辦理\n\n入會申請表單';

/* 顯示指定區塊、隱藏其他區塊 */
function showSection(sectionId) {
    document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
    const target = document.getElementById(sectionId);
    if (target) target.classList.add('active');
}

/* 依網址找出對應區塊：先精確比對，再用「最長的路徑片段」比對，最後回首頁。
   （舊寫法用 includes 依序判斷，'/service-apply' 會先被 'apply' 攔截而跳錯頁） */
function resolveSectionId(pathname) {
    const path = pathname.replace(/\/+$/, '') || '/';
    if (ROUTES[path]) return ROUTES[path];

    const hit = Object.keys(ROUTES)
        .filter(p => p !== '/' && path.includes(p))
        .sort((a, b) => b.length - a.length)[0];
    return hit ? ROUTES[hit] : ROUTES['/'];
}

/* 核心：無刷新切換頁面 */
function navigateTo(urlPath, sectionId, anchorId, alertMsg) {
    if (alertMsg) alert(alertMsg);

    showSection(sectionId);

    if (window.location.pathname !== urlPath) {
        history.pushState({ sectionId, anchorId }, '', urlPath);
    }

    const anchor = anchorId && document.getElementById(anchorId);
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* 「線上申請入會」：先跳出應備文件提醒，再前往申請頁 */
function navigateToApply() {
    navigateTo('/apply', 'apply-section', null, APPLY_NOTICE);
}

window.onpopstate = function () {
    showSection(resolveSectionId(window.location.pathname));
};

/* ------------------------------ 最新消息 ------------------------------ */
/* 依日期由新到舊排序（日期格式 YYYY-MM-DD，可直接比較字串）。
   卡片與彈窗都使用這份排序後的清單，所以點到的永遠是對的那一則 */
function getSortedNews() {
    // news.js 若寫錯而載入失敗，siteNews 不存在；這裡用 typeof 避免整個網站跟著壞掉
    // （也相容舊版的 newsDataList 名稱）
    let list = [];
    if (typeof siteNews !== 'undefined' && Array.isArray(siteNews)) list = siteNews;
    else if (typeof newsDataList !== 'undefined' && Array.isArray(newsDataList)) list = newsDataList;
    return [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
let sortedNews = [];

/* 公告上的「前往報名」按鈕：news.js 的 link 可寫網站內頁面（如 "/course-nanny-gov"）或完整網址 */
const NEWS_DEFAULT_LINK_TEXT = '立即前往報名 ➔';

function newsHasLink(item) {
    return Boolean(item && typeof item.link === 'string' && item.link.trim());
}

function newsLinkText(item) {
    return (item.linkText && String(item.linkText).trim()) || NEWS_DEFAULT_LINK_TEXT;
}

function openNewsTarget(link, anchor) {
    link = String(link).trim();
    if (/^https?:\/\//i.test(link)) {                  // 外部網址：另開分頁
        window.open(link, '_blank', 'noopener');
        return;
    }
    const path = '/' + link.replace(/^\/+/, '').replace(/\/+$/, '');
    if (path === '/apply') { navigateToApply(); return; }   // 入會申請：維持原本「應備文件」提醒
    if (!ROUTES[path]) console.warn('[最新消息] 找不到頁面路徑：' + path + '（請對照 app.js 的 ROUTES）');
    navigateTo(path, resolveSectionId(path), anchor || null);
}

function goNewsLink(index) {
    const item = sortedNews[index];
    if (!newsHasLink(item)) return;
    closeNewsDetailModal();
    openNewsTarget(item.link, item.anchor);
}

function renderNewsCards() {
    const container = document.getElementById('newsSliderContainer');
    if (!container) return;

    sortedNews = getSortedNews();
    if (sortedNews.length === 0) {
        container.innerHTML = '<p class="hint-text">目前沒有公告。</p>';
        return;
    }
    container.innerHTML = sortedNews.map((item, index) => {
        const img = item.image ? `<img src="${item.image}" alt="公告縮圖">` : '';
        const excerpt = item.content.replace(/<br\s*[\/]?\>/gi, ' ').substring(0, 40);
        return `
            <div class="news-card-slide" onclick="openNewsDetail(${index})">
                <div>
                    ${img}
                    <div class="news-card-date">${item.date}</div>
                    <h3 class="news-card-title">${item.title}</h3>
                    <p class="news-card-excerpt">${excerpt}...</p>
                </div>
                <div class="news-card-foot">
                    <span class="news-card-more">查看內容 ➔</span>
                    ${newsHasLink(item) ? `<button type="button" class="news-card-cta" onclick="event.stopPropagation(); goNewsLink(${index})">${newsLinkText(item)}</button>` : ''}
                </div>
            </div>`;
    }).join('');
}

function openNewsDetail(index) {
    const data = sortedNews[index];
    document.getElementById('newsModalDate').textContent = data.date;
    document.getElementById('newsModalTitle').textContent = data.title;
    document.getElementById('newsModalContent').innerHTML = data.content;

    const imgContainer = document.getElementById('newsModalImageContainer');
    if (data.image) {
        document.getElementById('newsModalImage').src = data.image;
        imgContainer.style.display = 'block';
    } else {
        imgContainer.style.display = 'none';
    }

    const actionBtn = document.getElementById('newsModalAction');
    if (actionBtn) {
        if (newsHasLink(data)) {
            actionBtn.textContent = newsLinkText(data);
            actionBtn.onclick = () => goNewsLink(index);
            actionBtn.style.display = 'block';
        } else {
            actionBtn.style.display = 'none';
            actionBtn.onclick = null;
        }
    }
    document.getElementById('newsDetailModal').style.display = 'flex';
}

function closeNewsDetailModal() {
    document.getElementById('newsDetailModal').style.display = 'none';
}

/* ------------------------------ 共用表單工具 ------------------------------ */

/* 生日下拉選單（年／月／日）。每個報名表各有一組 id */
function initBirthSelect(yId, mId, dId) {
    const ySelect = document.getElementById(yId);
    const mSelect = document.getElementById(mId);
    const dSelect = document.getElementById(dId);
    if (!ySelect || !mSelect || !dSelect) return;

    const range = (from, to, step = 1) => {
        const list = [];
        for (let n = from; step > 0 ? n <= to : n >= to; n += step) list.push(n);
        return list;
    };
    const options = (placeholder, values, label) =>
        `<option value="">${placeholder}</option>` +
        values.map(v => `<option value="${v}">${label(v)}</option>`).join('');

    const currentYear = new Date().getFullYear();
    ySelect.innerHTML = options('年份', range(currentYear, 1940, -1), y => `${y} 年 (民國${y - 1911}年)`);
    mSelect.innerHTML = options('月份', range(1, 12), m => `${m} 月`);
    dSelect.innerHTML = options('日期', range(1, 31), d => `${d} 日`);
}

const BIRTH_SELECT_PREFIXES = ['birth', 'laborBirth', 'serviceBirth', 'govBirth', 'selfBirth', 'skillBirth', 'matBirth', 'massageBirth'];

/* 入會表：有無眷屬 */
function toggleDepBox(show) {
    const display = show ? 'block' : 'none';
    document.getElementById('depDateContainer').style.display = display;
    document.getElementById('depDetailBox').style.display = display;
}

/* 徵選試題：顯示／隱藏答案 */
function toggleAnswer(ansId) {
    const el = document.getElementById(ansId);
    el.style.display = (el.style.display === 'block') ? 'none' : 'block';
}

/* ------------------------------ 手機版導覽選單 ------------------------------
   桌機維持滑鼠 hover 展開（純 CSS）；手機（<= 900px）改成點一下展開／收合。 */
const MOBILE_NAV_QUERY = '(max-width: 900px)';
const isMobileNav = () => window.matchMedia && window.matchMedia(MOBILE_NAV_QUERY).matches;

function closeMobileNav() {
    document.querySelectorAll('.nav-links .open').forEach(li => li.classList.remove('open'));
}

function initMobileNav() {
    // 有下層選單的按鈕（href="javascript:void(0);"）：點一下展開，並收起同層其他選單
    document.querySelectorAll('.nav-links a[href="javascript:void(0);"]').forEach(trigger => {
        trigger.addEventListener('click', () => {
            if (!isMobileNav()) return;
            const item = trigger.parentElement;
            const wasOpen = item.classList.contains('open');
            Array.from(item.parentElement.children).forEach(sib => sib.classList.remove('open'));
            if (!wasOpen) item.classList.add('open');
        });
    });

    // 點到真正的連結（跳頁、外部連結）後收起選單
    document.querySelectorAll('.nav-links a:not([href="javascript:void(0);"])').forEach(link => {
        link.addEventListener('click', closeMobileNav);
    });

    // 點選單以外的地方收起
    document.addEventListener('click', e => {
        if (!e.target.closest('.nav-links')) closeMobileNav();
    });
}

/* ------------------------------ 圖片彈窗（Lightbox） ------------------------------
   在連結上加 data-lightbox，點擊時就會用彈窗顯示圖片，不會跳轉或開新分頁。
   （若 JavaScript 沒載入，連結仍會正常在新分頁開啟圖片。） */
let lightboxOpener = null;

function openLightbox(src, alt, opener) {
    const box = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    lightboxOpener = opener || null;
    img.src = src;
    img.alt = alt || '';
    box.classList.remove('zoomed');
    box.scrollTop = 0;
    box.scrollLeft = 0;
    box.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('lightboxClose').focus();
}

function closeLightbox() {
    const box = document.getElementById('lightbox');
    if (!box.classList.contains('open')) return;
    box.classList.remove('open', 'zoomed');
    document.getElementById('lightboxImg').removeAttribute('src');
    document.body.style.overflow = '';
    if (lightboxOpener) lightboxOpener.focus();
}

function initLightbox() {
    // 事件委派：之後新增的圖片只要加 data-lightbox 就能用
    document.addEventListener('click', e => {
        const link = e.target.closest('a[data-lightbox]');
        if (!link) return;
        e.preventDefault();
        const thumb = link.querySelector('img');
        openLightbox(link.getAttribute('href'), thumb ? thumb.alt : '', link);
    });

    const box = document.getElementById('lightbox');
    box.addEventListener('click', e => {
        if (e.target.id === 'lightboxImg') box.classList.toggle('zoomed');   // 點圖：放大／縮小
        else closeLightbox();                                                  // 點空白或 ✕：關閉
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeLightbox();
    });
}

/* ------------------------- 學科模擬測驗（iframe）橋接 -------------------------
   手機版：依測驗頁回報的內容高度自動調整 iframe 高度（避免固定高度造成內外兩層捲動、
   點「下一題」後看不到新題目），並在換題時把外層頁面捲到題目位置。
   測驗頁（quiz.hcmccu.org）需使用 v892 以後的版本才會送出這些訊息；
   舊版測驗頁不會送訊息，此時仍維持 css 內的固定高度，功能不受影響。 */
function initQuizBridge() {
    const frame = document.querySelector('.quiz-iframe-wrapper iframe');
    if (!frame) return;
    const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
    let quizOrigin = '';
    try { quizOrigin = new URL(frame.getAttribute('src'), window.location.href).origin; } catch (e) { return; }

    window.addEventListener('message', function (e) {
        if (e.origin !== quizOrigin || e.source !== frame.contentWindow) return;
        const d = e.data;
        if (!d || d.source !== 'hcmccu-quiz') return;

        if (d.type === 'height') {
            if (isMobile()) {
                const h = Math.min(Math.max(Number(d.height) || 0, 400), 20000);
                frame.style.height = h + 'px';
            } else {
                frame.style.height = '';          // 桌機版維持 css 設定（滿版高度＋框內捲動）
            }
        } else if (d.type === 'scroll' && isMobile()) {
            const top = frame.getBoundingClientRect().top + window.scrollY + (Number(d.offset) || 0);
            window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
        }
    });
}

/* ------------------------------ 初始化 ------------------------------ */
/* 每個初始化步驟各自獨立執行：其中一個失敗（例如某個檔案沒載入）不會讓其他區塊跟著空白 */
function runInitStep(name, fn) {
    try {
        fn();
    } catch (err) {
        console.error(`[初始化失敗] ${name}：`, err);
        showLoadErrorNotice();
    }
}

function showLoadErrorNotice() {
    if (document.getElementById('loadErrorNotice')) return;
    const bar = document.createElement('div');
    bar.id = 'loadErrorNotice';
    bar.className = 'no-print';
    bar.textContent = '⚠️ 部分內容沒有正確載入，請按 Ctrl+F5（手機請清除瀏覽器快取）重新整理頁面；若仍有問題請聯絡網站管理員。';
    document.body.appendChild(bar);
}

document.addEventListener('DOMContentLoaded', function () {
    if (window.location.protocol.startsWith('http')) {
        runInitStep('初始路由', () => showSection(resolveSectionId(window.location.pathname)));
    }
    runInitStep('導覽選單', initMobileNav);
    runInitStep('圖片彈窗', initLightbox);
    runInitStep('學科測驗橋接', initQuizBridge);
    runInitStep('最新消息', renderNewsCards);
    runInitStep('生日選單', () => BIRTH_SELECT_PREFIXES.forEach(p => initBirthSelect(`${p}Year`, `${p}Month`, `${p}Day`)));
    runInitStep('職訓補助班', renderGovCourseBatches);
    runInitStep('市府自費班', renderSelfCourseBatches);
    runInitStep('術科加強班', renderSkillCourseBatches);
    runInitStep('月子培訓', renderMaternityCourseBatches);
    runInitStep('嬰幼兒按摩班', renderMassageCourseBatches);

    // 先用網站內建的梯次顯示，再嘗試從 Google 試算表讀取最新梯次（讀得到就更新畫面）
    runInitStep('讀取課程梯次', () => {
        loadRemoteBatches().then(changed => { if (changed) renderAllCourseBatches(); });
    });
});
