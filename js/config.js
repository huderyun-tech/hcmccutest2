/* ==========================================================================
   config.js — 後台連線設定（只有這一個檔案需要貼上後台網址）

   SHEETS_API_URL：Google Apps Script 部署後得到的「網頁應用程式網址」，
                   格式像 https://script.google.com/macros/s/XXXXXXXX/exec
                   設定方式請看「後台設定教學」。

   留空 ('') 時，網站維持原本的行為：報名表按送出只會跳出提醒，
   資料不會被記錄、課程梯次使用 data.js 裡的內建資料。
   ========================================================================== */

const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbygKB0EwGSVna_RYV_qWMFeh1G9NeU5JRwAJr6lCkgt3ug9i3sd_anp5DwmYIBHgxueDA/exec';

/* ==========================================================================
   加速層：放在網站專案 functions/api/ 資料夾的程式，隨網站一起用 Git 部署到 Cloudflare Pages。
   民眾開網頁讀取課程梯次、送出報名都先經過這一層，讀取從約 1～2 秒縮短到 0.1～0.2 秒。
   '/api'＝使用加速層（預設）；留空 ''＝照舊直接連 Google。
   加速層壞掉、或網站不是放在 Cloudflare Pages 時，網站會自動改回直接連 Google，報名不會中斷。
   ========================================================================== */
const FAST_API_URL = '/api';

/* ==========================================================================
   報名完成後的 LINE 設定
   LINE_URL               工會官方 LINE 加入連結（留空 '' 就不顯示任何 LINE 按鈕）
   LINE_REDIRECT_SECONDS  報名成功後，幾秒後自動前往 LINE；設 0 = 不自動跳轉（只顯示按鈕）
   ========================================================================== */
const LINE_URL = 'https://line.me/ti/p/tuSgX9zNyE';
const LINE_REDIRECT_SECONDS = 10;

/* ==========================================================================
   「我不是機器人」驗證（Cloudflare Turnstile，免費）
   TURNSTILE_SITE_KEY  在 Cloudflare 建立 Turnstile 小工具後取得的「網站金鑰 (Site Key)」，
                       這把是公開的，可以放在這裡。
                       留空 '' = 不啟用驗證（網站照常運作）。
   另一把「密鑰 (Secret Key)」不可放在這裡，要放在 Apps Script 的「指令碼屬性」，
   名稱 TURNSTILE_SECRET（詳見使用說明）。
   ========================================================================== */
const TURNSTILE_SITE_KEY = '';
