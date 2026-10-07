# RF TestFunction · LAB602

RFLinkBudget SwiftUI 專案的繁體中文網頁版，採原生 HTML/CSS/JavaScript，無第三方執行期依賴。

## 功能

- 輸入依訊號路徑分為發射端、路徑、接收端、需求四區，與八階段功率分析對應；路徑損耗依天線對準（極化、指向）、大氣與電離層（大氣與雨衰、雲霧、對流層與電離層閃爍、電離層吸收、天線罩淋濕）、地形與障礙物（植被、建築物穿透、地物遮蔽、繞射與遮擋、多路徑）及其他分項輸入。
- 極化失配與指向損耗計算器：極化依兩端類型（線性、右旋／左旋圓極化與軸比）及夾角（已知、未知平均、未知最差）計算；指向損耗以 12 (θe/θ3dB)² 計算兩端並相加，波束寬度可由碟形天線直徑估算（70 λ/D）。
- 大氣、電離層與天線罩估算：每個分項欄位下方都有自己的估算工具，路徑類型、時間百分比、溫度、氣壓、水氣與測站位置等條件集中在「估算的共用條件」——大氣氣體（ITU-R P.676-12）與雨衰（P.838-3 搭配 P.530-17 或 P.618-13）、雲霧（P.840）、對流層閃爍（P.618-13）、電離層閃爍（P.531，需輸入 S4，以 f^−1.5 換算並依 Nakagami 分佈估算衰落）、電離層吸收（P.531，sec(i)/f²）、天線罩淋濕（Gibble 層流水膜厚度與水層傳輸損耗）。地區參數預設為台北（25.04° N, 121.53° E）的 ITU-R 地圖數值（P.837 降雨率、P.839 雨高、P.1510 溫度、P.836 水氣密度、P.1511 高度、P.453 濕折射率、P.840 雲中液態水），未修改時以橘色顯示；雲中液態水與天線罩降雨率會依時間百分比自動帶入。S4 沒有地區地圖，需自行輸入量測或 GISM 模型值。
- 地形與障礙物估算：植被（ITU-R P.833）、建物穿透（P.2109）、地物遮蔽（P.2108）、單一刀鋒繞射（P.526，含地球曲率隆起）與地面鏈路多路徑衰落（P.530-19，以 P.841 換算平均最差月）。台北的地氣候因子 log K 與 dN75 取自 P.530-19 地圖，同樣以橘色顯示。用計算器填入的損耗會隨頻率與距離自動重算，手動修改過的值不會被覆蓋。
- 單位：頻率 MHz/GHz、距離 m/km、TX 功率 dBm/W、天線增益 dBi/dBd、頻寬 Hz/kHz/MHz，切換時自動換算。
- RX 放大器位置可選線材前（天線端 LNA）或線材後，影響 Friis 系統 NF。
- 選填 EIRP 上限，超過時警告；明顯不合理的輸入（例如正值靈敏度、頻率超出 3 kHz–3 THz）會提醒但不阻擋計算。
- 近場檢查：距離小於 10 個波長時標示警告，圖表以陰影標出近場區。
- 輸入保留、清除及復原。
- 對數距離圖表：標示鏈路距離與最大距離，距離檢視滑桿的位置會在曲線上以游標點顯示。
- 資料速率：由 C/N₀ 計算 Eb/N₀、Eb/N₀ 餘裕（含實作損耗）及可支援的最大資料速率。
- 雜訊分析：總系統 NF 可直接輸入，或由 RX 線損、放大器與接收機 NF 以 Friis 公式計算；選填天線雜訊溫度（預設 290 K）以計算系統雜訊溫度；顯示 SNR、由 NF 推算的等效靈敏度（與輸入值對照）及 G/T。
- 多點實測：輸入或從試算表貼上「距離、實測功率」，逐點比較預測值，並以最小平方法擬合對數距離路徑損耗模型（指數 n、遮蔽 σ、R²、擬合最大距離），結果畫在圖表與報告中。
- 本機方案儲存、載入、分析、刪除及雙方案比較。
- 可列印的完整報告：按「PDF 報告／列印」，於瀏覽器列印視窗儲存為 PDF。
- 雙向 dBm/W、單程一階 Doppler、頻率及徑向速度單位換算。
- 響應式排版、系統／深／淺色、減少動態效果偏好、計算動畫、支援瀏覽器的觸覺回饋。

## 程式結構

| 檔案 | 用途 |
|---|---|
| `site/calculations.mjs` | 純計算（FSPL、鏈路預算、雜訊、功率、Doppler），不碰 DOM，由測試直接引用 |
| `site/i18n.mjs` | 介面語言、`t()` 翻譯與靜態頁面替換 |
| `site/strings-zh-TW.mjs` | 繁體中文字典 |
| `site/ui.mjs` | 共用的 DOM、格式化、localStorage 與單位切換工具 |
| `site/budget.mjs` | Link Budget 頁：輸入表單、結果、距離／雜訊／實測分析、儲存與列印 |
| `site/chart.mjs` | 接收功率對距離的 SVG 圖表 |
| `site/report.mjs` | 列印／PDF 報告內容 |
| `site/measurements.mjs` | 多點實測表格、與預測的差值、路徑損耗指數擬合 |
| `site/atmosphere.mjs` | ITU-R 大氣氣體與降雨衰減模型（純計算） |
| `site/path-losses.mjs` | 路徑損耗分項的定義與舊格式轉換 |
| `site/alignment.mjs` | 極化失配與指向損耗（純計算） |
| `site/terrain.mjs` | 植被、建物穿透、地物遮蔽、繞射與多路徑模型（純計算） |
| `site/loss-calculators.mjs` | 極化與指向損耗計算器的介面 |
| `site/estimator.mjs` | 大氣、電離層、天線罩與地形估算工具的介面 |
| `site/help.mjs` | 傳播路徑各欄位下方的說明文字 |
| `site/plans.mjs` | Saved Plans 頁：方案清單、刪除、雙方案比較 |
| `site/tools.mjs` | Power Converter 與 Doppler Shift 頁 |
| `site/prefs.mjs` | 外觀、動畫與觸覺回饋偏好 |
| `site/app.mjs` | 進入點：分頁切換與各模組串接 |

## 介面語言

頁首可切換 English／繁體中文，選擇會記在瀏覽器；第一次開啟時依瀏覽器語言決定。切換時重新載入頁面，目前的計算結果、分頁與捲動位置會保留。

程式與 HTML 中的文字一律寫英文，翻譯以英文原文為鍵放在 `site/strings-zh-TW.mjs`：JS 文字經 `t()`（`site/i18n.mjs`）查表，靜態 HTML 在載入時依文字內容替換。新增或修改英文文字時，請在字典加上對應的繁中翻譯；漏翻的文字會直接顯示英文。

## 公式顯示

頁面上的公式以瀏覽器原生的 MathML 顯示，不需要任何數學函式庫。公式的 LaTeX 原始碼在 `tools/render_formulas.py`，`site/index.html` 只放 `<!-- eq:名稱 --><!-- /eq -->` 標記與產生的 MathML。修改公式時改 LaTeX 後重新產生：

```sh
pip install latex2mathml
python tools/render_formulas.py
```

## 本機預覽

在專案目錄執行：

```sh
python tools/serve.py          # 只有這台電腦：http://localhost:8080
python tools/serve.py --lan    # 同網路的手機也能開，網址會印在終端機
```

這個伺服器會停用快取。不要用 `python -m http.server`：瀏覽器（特別是 iOS Safari）可能把新舊版本的 JS 模組混在一起使用，造成頁面無法啟動、輸入欄位消失。
不要直接以 file:// 開啟：ES modules 需要 HTTP。手機連不到時，確認 Windows 防火牆允許 Python 存取「私人網路」。

## GitHub Pages

由 GitHub Actions 自動測試與發布（`.github/workflows/pages.yml`）：

- 每次 push 和 pull request 都會執行計算測試與所有模組的語法檢查。
- 只有 push 到 `main`（或在 Actions 頁手動執行）且測試通過時，才會把 `site/` 發布到 Pages；測試失敗時網站維持上一版。
- 發布前 `tools/stamp_version.py` 會在 HTML 與各模組引用的 `.mjs`／`.css` 網址加上 `?v=<commit>`，讓每次部署都使用新網址，避免瀏覽器把快取的舊模組和新模組混用而無法啟動。原始碼不需手動改版本號。新增模組時，請用 `import … from './名稱.mjs'` 的寫法，否則檢查會失敗。

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

Node.js 22 或更新：`node --test tests/*.test.mjs`。大氣、雨衰、雲霧與對流層閃爍模型的參考值取自 ITU-Rpy（`itur` 0.4.0）以相同輸入計算的結果；Nakagami 衰落以 SciPy 核對；電離層閃爍與吸收對照 ITU-R P.531-16 的表 1 與表 3。地形與障礙物模型以 SciPy 依 ITU-R 原文公式獨立計算核對，刀鋒繞射近似式並與 Fresnel 積分精確解比較。參考值移植自原專案 Tests/main.swift，涵蓋線損位置、增益、餘裕邊界、雜訊參考、功率換算和 Doppler。
