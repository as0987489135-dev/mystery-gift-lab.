# 神秘禮物研究所（起始專案）

這是網站第一版起始專案：包含 Supabase Email 註冊／登入、建立活動、使用活動代碼加入活動，以及基本視覺介面。

## 重要說明
目前是前端起始版，不代表整套交換禮物功能已完成。問卷排序、禮物填寫、排名鎖定、抽籤、猜排名解鎖等畫面，會在確認資料庫 RPC 與回傳欄位後接續完成。

## 1. 安裝
請先安裝 Node.js 20 或更新版本。解壓縮後，在專案資料夾開啟終端機，執行：

```bash
npm install
```

## 2. 設定 Supabase
複製 `.env.example` 並改名為 `.env.local`，填入：
- `NEXT_PUBLIC_SUPABASE_URL`：已預填專案網址
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：填入 Supabase 的 `sb_publishable_...` 公開金鑰

不要放入 `service_role` 或任何 `sb_secret_...` 金鑰。

## 3. 啟動
```bash
npm run dev
```
瀏覽器開啟 http://localhost:3000

## 4. 目前使用的 RPC
- `gift_create_activity({ p_activity_name })`
- `gift_join_activity({ p_code, p_display_name })`

如果執行時出現 RPC 參數名稱不符，請先不要修改資料庫，將錯誤訊息截圖回報，以便依照實際函數定義調整前端。

## 5. 部署前提醒
正式公開前仍需完成並測試所有資料讀寫 RPC、RLS、Email redirect URL、活動管理與遊戲流程。前端只使用 publishable key；絕不可將 Supabase secret/service_role key 放入瀏覽器或 GitHub。
