# RF TestFunction · LAB602

RFLinkBudget SwiftUI 專案的繁體中文網頁版，採原生 HTML/CSS/JavaScript，無第三方執行期依賴。

## 功能

- FSPL、接收功率、鏈路餘裕、七階段功率分析。
- MHz/GHz、m/km 自動換算、輸入保留、清除及復原。
- 對數距離圖表、距離檢視滑桿、最大距離。
- 290 K 總系統 NF 雜訊分析、SNR 與實測差異。
- 本機方案儲存、載入、分析、刪除及雙方案比較。
- 可列印的完整報告：按「PDF 報告／列印」，於瀏覽器列印視窗儲存為 PDF。
- 雙向 dBm/W、單程一階 Doppler、頻率及徑向速度單位換算。
- 響應式排版、系統／深／淺色、減少動態效果偏好、計算動畫、支援瀏覽器的觸覺回饋。

## 本機預覽

在專案目錄執行 `python3 -m http.server 8080 --directory site`，開啟 http://localhost:8080 。
不要直接以 file:// 開啟：ES modules 需要 HTTP。

## GitHub Pages

目前使用分支發布，不需要額外的 workflow token 權限。

1. 若使用 GitHub Free，repository 必須為 Public 才能啟用 Pages；私人 repository 需支援 Pages 的付費方案。
2. Settings → Pages → Source 選擇 Deploy from a branch。
3. Branch 選擇 `gh-pages`，目錄選擇 `/ (root)`，按 Save。
4. 發布成功網址以 Pages 頁面為準，預期為 https://t111368105.github.io/RF_TestFunction/ 。

更新後先驗證，再發布：

```sh
node --test tests/*.test.mjs
node --check site/app.mjs
git add .
git commit -m "Update RF tools"
git push origin main
git subtree push --prefix site origin gh-pages
```

`main` 保存原始碼與測試，`gh-pages` 只包含網站檔案。`deployment/pages-workflow.example.yml` 是選用的 Actions 工作流程範例，目前不會自動執行。

## 資料與限制

所有計算均在瀏覽器執行。方案與偏好透過 localStorage 存在同一個瀏覽器，不會同步至 GitHub 或其他裝置。清除網站資料、切換網域或使用無痕視窗可能使方案不可用。儲存失敗時會顯示通知。

PDF 使用瀏覽器的列印／儲存功能；分享 PDF 使用裝置自身的檔案分享功能。觸覺回饋取決於 Vibration API 支援，iOS Safari 等不支援時會略過。

公式沿用 Swift 原版：FSPL 常數 32.44；雜訊常數 −173.975；c = 299792458 m/s。總 NF 參考至 RX 天線輸出，SNR 使用 RX 天線輸出功率。最大距離依靈敏度及餘裕計算，不依 SNR。詳細物理限制見網頁內模型假設。

## 驗證

Node.js 22 或更新：`node --test tests/*.test.mjs`。參考值移植自原專案 Tests/main.swift，涵蓋線損位置、增益、餘裕邊界、雜訊參考、功率換算和 Doppler。
