/* ==========================================================================
   data.js — 課程梯次、聯絡資訊、勞健保費率
   （最新消息請改 js/news.js）
   1. 各課程梯次          govCourseBatches / selfCourseBatches / skillCourseBatches
                          maternityCourseBatches / massageCourseBatches
   2. 聯絡與匯款資訊      CONTACT
   3. 勞健保費率          CONSTANTS / salaryLevels

   梯次欄位說明：
     regEnd      報名截止時間，過了這個時間會自動關閉報名
     forceClosed true = 手動強制關閉（並顯示 closedReason）
     quota       剩餘名額，<= 0 時自動顯示額滿
     totalQuota  總名額（連上 Google 試算表後，尚餘名額 ＝ 總名額 － 已報名人數，由後台自動計算）
   ========================================================================== */

/* 1. 課程梯次 --------------------------------------------------------------- */
// 📌 【方案 B 預留接口】115年度托育職訓補助班 - 梯次與動態截止日設定
const govCourseBatches = [
    {
        id: "115BT1",
        name: "托育人員職業訓練班-115BT1平日班（新竹市02期）",
        shortLabel: "4/10-4/30 托育平日班 $9500 徵試日3/31",
        period: "4/10-4/30 (每週1-5) 共133小時",
        examDate: "3/31",
        regStart: "2026-01-01 00:00",
        regEnd: "2026-03-25 23:30",
        quota: 60,
        forceClosed: false,
        closedReason: ""
    },
    {
        id: "115BT2",
        name: "托育人員職業訓練班-115BT2平日班（新竹市03期）",
        shortLabel: "6/8-6/29 托育平日班 $9500 徵試日6/1",
        period: "6/8-6/29 (每週1-5) 共133小時",
        examDate: "6/1",
        regStart: "2026-01-01 00:00",
        regEnd: "2026-05-28 18:00",
        quota: 60,
        forceClosed: false,
        closedReason: ""
    },
    {
        id: "115BT3",
        name: "托育人員職業訓練班-115BT3平日班（新竹市04期）",
        shortLabel: "8/3-8/21 托育平日班 $9500 徵試日7/27",
        period: "8/3-8/21 (每週1-5) 共133小時",
        examDate: "7/27",
        regStart: "2026-01-01 00:00",
        regEnd: "2026-05-26 23:30",
        quota: 0,
        forceClosed: true,
        closedReason: "8月班次因場地維護，本班次停止招生，造成不便敬請見諒"
    },
    {
        id: "115BT4",
        name: "托育人員職業訓練班-115BT4平日班（新竹市05期）",
        shortLabel: "11/2-11/20 托育平日班 $9500 徵試日10/23",
        period: "11/2-11/20 (每週1-5) 共133小時",
        examDate: "10/23",
        regStart: "2026-01-01 00:00",
        regEnd: "2026-10-19 12:00",
        quota: 60,
        forceClosed: false,
        closedReason: ""
    }
];

// 📌 【方案 B 預留接口】115年度托育市府委訓自費班 - 梯次與動態截止日設定
const selfCourseBatches = [
    {
        id: "115SELF01",
        name: "11501期 3/7-4/26(假日) 市政府托育自費班",
        shortLabel: "11501期 3/7-4/26(假日)市政府托育自費班 $8400",
        period: "3/7 - 4/26（假日班）",
        fee: "$8,400 元",
        regEnd: "2026-03-04 23:59",
        quota: 35,
        forceClosed: false,
        closedReason: ""
    }
];

// 📌 【方案 B 預留接口】116年度保母術科模考加強班 - 梯次與動態截止日設定
const skillCourseBatches = [
    {
        id: "116SKILL02",
        name: "2月平日班",
        dates: "2/23、2/24、2/25、2/26",
        regEnd: "2027-02-18 23:59",
        quota: 4,
        forceClosed: false,
        closedReason: ""
    },
    {
        id: "116SKILL05",
        name: "5月平日班",
        dates: "5/11、5/12、5/13、5/14",
        regEnd: "2027-05-06 23:59",
        quota: 16,
        forceClosed: false,
        closedReason: ""
    },
    {
        id: "116SKILL09",
        name: "9月平日班",
        dates: "9/7、9/8、9/9、9/10",
        regEnd: "2027-09-02 23:59",
        quota: 16,
        forceClosed: false,
        closedReason: ""
    }
];

// 📌 【方案 B 預留接口】115年 月子專業培訓（職前訓練） - 梯次與動態截止日設定
// 💡 提示：若目前為「報名截止」狀態，可將 forceClosed 設為 true，或將 regEnd 設為已過期日期；若新梯次開放招生，只要把 forceClosed 改為 false 並更新 dates 與 regEnd 即可自動解鎖報名表！
const maternityCourseBatches = [
    {
        id: "115MAT01",
        name: "01期",
        dates: "5/05 5/06 5/07 5/08 5/11 5/12 5/13 5/14",
        regEnd: "2026-04-30 23:59",
        totalQuota: 25,
        forceClosed: true, // 目前截圖顯示為 (報名截止)，要開放新梯次時改為 false 即可
        closedReason: "報名截止"
    }
];

// 📌 【方案 B 預留接口】115年 嬰幼兒按摩證書班 - 梯次與動態截止日設定
const massageCourseBatches = [
    {
        id: "115MASSAGE03",
        name: "3月平日",
        dateText: "3月4日",
        regStart: "2025-11-06 00:00",
        regEnd: "2026-03-03 00:00",
        quota: 16,
        forceClosed: false,
        closedReason: ""
    },
    {
        id: "115MASSAGE05",
        name: "5月平日",
        dateText: "5月20日",
        regStart: "2025-11-06 00:00",
        regEnd: "2026-05-13 00:00",
        quota: 16,
        forceClosed: false,
        closedReason: ""
    },
    {
        id: "115MASSAGE09",
        name: "9月平日",
        dateText: "9月9日",
        regStart: "2025-11-06 00:00",
        regEnd: "2026-09-10 00:00",
        quota: 16,
        forceClosed: false,
        closedReason: ""
    },
    {
        id: "115MASSAGE12",
        name: "12月平日",
        dateText: "12月9日",
        regStart: "2025-11-06 00:00",
        regEnd: "2026-12-02 00:00",
        quota: 16,
        forceClosed: false,
        closedReason: ""
    }
];

/* 2. 聯絡與匯款資訊（各報名表送出後的提醒訊息會引用這裡） ---------------- */
const CONTACT = {
    phone: '03-5265126',
    unionLineId: '5313176',        // 工會官方 LINE ID
    maternityLineId: '5265126',    // 月子平台 LINE ID
    bank: '永豐銀行(807) 032-018-0023133-8'
};

/* 3. 勞健保費率 --------------------------------------------------------- */
const CONSTANTS = { UNION_MONTHLY_FEE: 120, ENTRY_FEE: 1000, ACCIDENT_RATE: '0.19%' };
const salaryLevels = [
    { level: 1, salary: 29500, laborFee: 2070, nhiFee: 915 }, { level: 2, salary: 30300, laborFee: 2126, nhiFee: 940 },
    { level: 3, salary: 31800, laborFee: 2230, nhiFee: 986 }, { level: 4, salary: 33300, laborFee: 2336, nhiFee: 1033 },
    { level: 5, salary: 34800, laborFee: 2441, nhiFee: 1079 }, { level: 6, salary: 36300, laborFee: 2546, nhiFee: 1126 },
    { level: 7, salary: 38200, laborFee: 2680, nhiFee: 1185 }, { level: 8, salary: 40100, laborFee: 2813, nhiFee: 1244 },
    { level: 9, salary: 42000, laborFee: 2946, nhiFee: 1303 }, { level: 10, salary: 43900, laborFee: 3079, nhiFee: 1362 },
    { level: 11, salary: 45800, laborFee: 3212, nhiFee: 1421 }
];

const LABOR_FEE_TABLE = {};
salaryLevels.forEach(lvl => {
    LABOR_FEE_TABLE[lvl.salary] = {};
    const dailyApprox = lvl.laborFee / 30;
    for(let i=1; i<=30; i++) {
        LABOR_FEE_TABLE[lvl.salary][i] = i === 30 ? lvl.laborFee : Math.round(dailyApprox * i);
    }
});
