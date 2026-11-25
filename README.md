# Assistant 0.2.0

Published by a270095472

Assistant 是 Chrome 側邊面板擴充功能，提供平台辨識與切換、使用者偏好、提醒、個人筆記及唯讀 SOP 百科。內建檢查清單為 AI 生成的示範，不代表平台官方政策或真實商品條件；請依當前商品頁資訊判斷。

## 安裝

1. 解壓下載的 ZIP，保留原有目錄結構；不需要 Node.js 或 npm。
2. 在 Chrome 開啟 `chrome://extensions`，啟用「開發人員模式」。
3. 選擇「載入未封裝項目」，選取本資料夾中的 `extension`。
4. 使用擴充功能按鈕開啟 Assistant 側邊面板。最低支援 Chrome 114。

## 編輯與匯入 Excel

複製 `examples/Assistant_SOP_Example_Template.xlsx`，依原有欄位與說明在副本修改、保存或新增規則。儲存後，在 Assistant 的匯入功能選取檔案、檢查預覽，再確認套用。刪除規則前請檢查刪除預覽；不適用條件沿用 `notApplicable` 語意。SOP 正文在 Excel 中編輯，擴充功能提供匯入、預覽、確認及唯讀百科，不提供 SOP 正文編輯器。

## JSON 與示範資料

`examples/Assistant_SOP_Example.json` 是與 Excel 及內建示範同源的 Schema 3.0.0 範例，可供既有 JSON 匯入流程使用。`examples/AI-SOP.md` 說明示範規則。內建示範與使用者匯入的 Current 分離；已有 Current 優先顯示，示範不覆蓋使用者資料、偏好或筆記。

## 使用條款

個人與企業可免費使用 Assistant，包括商業工作。未經另行授權，不得重新包裝、販售或再散布 Assistant 自有程式。完整條件及發行前待確認事項見 `TERMS-OF-USE.md`；第三方元件仍依各自授權，見 `NOTICE.md`。產品採自訂免費使用授權，並非標準開源授權。

`SHA256SUMS.txt` 記錄除清單自身外各發布檔案的 SHA-256；版本說明見 `RELEASE-NOTES.md`。
