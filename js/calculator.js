/* ==========================================================================
   calculator.js — 勞健保收費標準試算（季繳）
   費率與級距資料在 data.js（CONSTANTS / salaryLevels / LABOR_FEE_TABLE）
   ========================================================================== */

const MAX_CHARGEABLE_DEPENDENTS = 3;   // 健保眷屬最多計 3 口
const MAX_LOOP_MONTHS = 60;            // 迴圈保險上限

let currentPaymentCycle = 1;           // 繳費週期（季繳＝每期 3 個月）
let dateType = 'today';

/* ------------------------------ 日期工具 ------------------------------ */
function formatTwDate(date) {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/* <input type="date"> 需要 YYYY-MM-DD，且要用「本地」日期。
   （舊寫法 toISOString() 是 UTC，台灣凌晨 0～8 點會變成前一天） */
function toDateInputValue(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function setToday() {
    dateType = 'today';
    const today = new Date();

    const todayText = document.getElementById('todayText');
    if (todayText) todayText.textContent = formatTwDate(today);

    const customDate = document.getElementById('customDate');
    if (customDate) customDate.value = toDateInputValue(today);
}

function setDateCustom() {
    dateType = 'custom';
}

/* ------------------------------ 初始化 ------------------------------ */
function initCalculator() {
    const select = document.getElementById('salaryLevel');
    if (select) {
        salaryLevels.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.salary;
            opt.textContent = `第 ${item.level} 級 - $${item.salary.toLocaleString()}`;
            select.appendChild(opt);
        });
        select.value = salaryLevels[0].salary;
    }
    setToday();

    const unionFeeStr = document.getElementById('unionMonthlyFeeStr');
    if (unionFeeStr) unionFeeStr.textContent = CONSTANTS.UNION_MONTHLY_FEE;

    const accidentRateStr = document.getElementById('accidentRateStr');
    if (accidentRateStr) accidentRateStr.textContent = CONSTANTS.ACCIDENT_RATE;
}

document.addEventListener('DOMContentLoaded', () => runInitStep('勞健保試算', initCalculator));

/* ------------------------------ 試算 ------------------------------ */

/* 每月明細小標籤，例如「2026年11月 2070元」 */
function feeChip(year, month, fee) {
    return `<span class="bg-slate-100 px-2 py-0.5 rounded text-slate-600 text-xs">${year}年${month}月 ${fee}元</span>`;
}

/* 季繳：算出本期結算的最後一天。
   - 起算月剛好是季末（3/6/9/12 月）→ 繳到下一個季末
   - 否則 → 繳到當季季末
   之後每多一期再加 3 個月 */
function getPeriodEndDate(startYear, startMonthReal) {
    const isSettlementMonth = startMonthReal % 3 === 0;
    const baseMonth = isSettlementMonth
        ? startMonthReal + 3
        : Math.ceil(startMonthReal / 3) * 3;

    let endMonth = baseMonth + (currentPaymentCycle - 1) * 3;
    let endYear = startYear;
    while (endMonth > 12) {
        endMonth -= 12;
        endYear += 1;
    }
    return new Date(endYear, endMonth, 0);   // 該月最後一天
}

function handleCalculate() {
    const salary = parseInt(document.getElementById('salaryLevel').value);
    const dependents = parseInt(document.getElementById('dependents').value);
    const rawDateStr = document.getElementById('customDate').value;
    if (!rawDateStr) {
        alert('請選擇加保日期！');
        return;
    }
    const startDate = new Date(rawDateStr.replace(/-/g, '/'));

    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth();
    const startDay = startDate.getDate();

    const monthlyNHI = salaryLevels.find(s => s.salary === salary).nhiFee;
    const endDate = getPeriodEndDate(startYear, startMonth + 1);

    let laborTotal = 0, nhiTotal = 0, unionTotal = 0, totalLaborDays = 0;
    let laborChips = '', nhiChips = '', unionChips = '';

    const loopDate = new Date(startYear, startMonth, 1);
    let monthCount = 0;

    while (loopDate <= endDate && monthCount < MAX_LOOP_MONTHS) {
        monthCount++;
        const year = loopDate.getFullYear();
        const month = loopDate.getMonth() + 1;
        const isFirstMonth = (year === startYear && loopDate.getMonth() === startMonth);

        // 首月中途加保：依剩餘天數按日計算（以 30 天為一個月）
        let days = 30;
        if (isFirstMonth && startDay > 1) {
            days = startDay === 31 ? 1 : Math.max(0, 30 - startDay + 1);
        }
        totalLaborDays += days;

        const laborFee = (LABOR_FEE_TABLE[salary] && LABOR_FEE_TABLE[salary][days]) || 0;
        laborTotal += laborFee;
        laborChips += feeChip(year, month, laborFee);

        unionTotal += CONSTANTS.UNION_MONTHLY_FEE;
        unionChips += feeChip(year, month, CONSTANTS.UNION_MONTHLY_FEE);

        nhiTotal += monthlyNHI;
        nhiChips += feeChip(year, month, monthlyNHI);

        loopDate.setMonth(loopDate.getMonth() + 1);
    }

    const nhiDependentsTotal = nhiTotal * Math.min(dependents, MAX_CHARGEABLE_DEPENDENTS);
    const grandTotal = CONSTANTS.ENTRY_FEE + unionTotal + laborTotal + nhiTotal + nhiDependentsTotal;

    renderCalcResult({
        salary, dependents, startDate, endDate, monthCount,
        unionTotal, unionChips,
        laborTotal, laborChips, totalLaborDays,
        nhiTotal, nhiChips, nhiDependentsTotal,
        grandTotal
    });
}

/* 把試算結果寫進畫面 */
function renderCalcResult(r) {
    const money = n => `$${n.toLocaleString()}`;
    const setText = (id, text) => { document.getElementById(id).textContent = text; };
    const setHtml = (id, html) => { document.getElementById(id).innerHTML = html; };

    setText('resCycle', '季繳');
    setText('resLaborSalary', money(r.salary));
    setText('resNHISalary', money(r.salary));
    setText('resDependents', `${r.dependents} 人`);
    setText('resMonths', `${r.monthCount} 個月`);
    setHtml('resPeriod', `${formatTwDate(r.startDate)} <br/> ~ ${formatTwDate(r.endDate)}`);

    setText('resEntryFee', money(CONSTANTS.ENTRY_FEE));
    setText('resUnionTotal', money(r.unionTotal));
    setHtml('resUnionDetails', r.unionChips);

    const laborMonths = Math.floor(r.totalLaborDays / 30);
    const laborExtraDays = r.totalLaborDays % 30;
    setText('resLaborDaysStr', `投保天數共計：${laborExtraDays > 0 ? `${laborMonths}個月又${laborExtraDays}天` : `${laborMonths}個月`}`);
    setText('resLaborTotal', money(r.laborTotal));
    setHtml('resLaborDetails', r.laborChips);

    setText('resNHITotal', money(r.nhiTotal));
    setHtml('resNHIDetails', r.nhiChips);

    setText('resDepCountStr', `${r.dependents} 口`);
    setText('resNHIDepTotal', r.dependents > 0 ? money(r.nhiDependentsTotal) : '-');
    setText('resNHIDepNote', r.dependents > 0 ? '費用與會員每月全民健保費用相同' : '無眷屬依附');

    setText('resGrandTotal', money(r.grandTotal));
    setText('resCalcDate', formatTwDate(r.startDate));

    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('resultState').classList.remove('hidden');
}
