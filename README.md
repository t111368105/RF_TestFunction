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

## 程式結構

| 檔案 | 用途 |
|---|---|
| `site/calculations.mjs` | 純計算（FSPL、鏈路預算、雜訊、功率、Doppler），不碰 DOM，由測試直接引用 |
| `site/ui.mjs` | 共用的 DOM、格式化、localStorage 與單位切換工具 |
| `site/budget.mjs` | Link Budget 頁：輸入表單、結果、距離／雜訊／實測分析、儲存與列印 |
| `site/chart.mjs` | 接收功率對距離的 SVG 圖表 |
| `site/report.mjs` | 列印／PDF 報告內容 |
| `site/plans.mjs` | Saved Plans 頁：方案清單、刪除、雙方案比較 |
| `site/tools.mjs` | Power Converter 與 Doppler Shift 頁 |
| `site/prefs.mjs` | 外觀、動畫與觸覺回饋偏好 |
| `site/app.mjs` | 進入點：分頁切換與各模組串接 |

## 本機預覽

在專案目錄執行 `python3 -m http.server 8080 --directory site`，開啟 http://localhost:8080 。
不要直接以 file:// 開啟：ES modules 需要 HTTP。

## GitHub Pages

由 GitHub Actions 自動測試與發布（`.github/workflows/pages.yml`）：

- 每次 push 和 pull request 都會執行計算測試與所有模組的語法檢查。
- 只有 push 到 `main`（或在 Actions 頁手動執行）且測試通過時，才會把 `site/` 發布到 Pages；測試失敗時網站維持上一版。

首次設定：

1. 若使用 GitHub Free，repository 必須為 Public 才能啟用 Pages；私人 repository 需支援 Pages 的付費方案。
2. Settings → Pages → Build and deployment → Source 選擇 **GitHub Actions**。
3. 發布成功網址以 Pages 頁面為準，預期為 https://t111368105.github.io/RF_TestFunction/ 。

日常更新只需 push 到 `main`，可在 repository 的 Actions 頁查看測試與發布結果：

```sh
git push origin main
```

推送前也可在本機先跑相同的檢查：

```sh
node --test tests/*.test.mjs
for f in site/*.mjs; do node --check "$f"; done
```

改用 Actions 後不再需要 `gh-pages` 分支，確認新網站正常後可自行刪除。

## 資料與限制

所有計算均在瀏覽器執行。方案與偏好透過 localStorage 存在同一個瀏覽器，不會同步至 GitHub 或其他裝置。清除網站資料、切換網域或使用無痕視窗可能使方案不可用。儲存失敗時會顯示通知。

PDF 使用瀏覽器的列印／儲存功能；分享 PDF 使用裝置自身的檔案分享功能。觸覺回饋取決於 Vibration API 支援，iOS Safari 等不支援時會略過。

公式沿用 Swift 原版：FSPL 常數 32.44；雜訊常數 −173.975；c = 299792458 m/s。總 NF 參考至 RX 天線輸出，SNR 使用 RX 天線輸出功率。最大距離依靈敏度及餘裕計算，不依 SNR。詳細物理限制見網頁內模型假設。

## 驗證

Node.js 22 或更新：`node --test tests/*.test.mjs`。參考值移植自原專案 Tests/main.swift，涵蓋線損位置、增益、餘裕邊界、雜訊參考、功率換算和 Doppler。
