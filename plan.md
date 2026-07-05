# LAN Share 改善計畫 — v1.3.0（規劃提案）

> 狀態：**已實作完成**。v1.3.0 已完成，66 項測試全數通過，見 git `HEAD`。
> 前一輪 v1.2.0（路徑安全、token 認證、17 項單元測試、health/info API）見 git `e364158`。

## 專案現況摘要

LAN Share 是一鍵部署的家用區域網路檔案伺服器：

- **Samba (SMB)**：桌機掛載網路磁碟
- **Node.js Web UI**：瀏覽器檔案管理（瀏覽、上傳、預覽、文字編輯、搜尋、圖片編輯、C2PA 清除）

技術棧：Bash (`setup.sh`) + Express 4 + 原生 HTML/CSS/JS（無前端框架）。

CBM 索引結果：22 檔、58 符號、205 邊；核心模組 `server.js`(562)、`public/app.js`(1144)、`lib/auth.js`、`lib/path-utils.js`、`categorize.js`、`strip-c2pa.js`。

## CBM 分析發現的問題

| # | 類別 | 問題 | 位置 | 嚴重度 |
|---|------|------|------|--------|
| 1 | 效能 | 全面同步 fs（`readdirSync`/`statSync`/`readFileSync`/`writeFileSync`），大目錄或大檔阻塞事件迴圈，單一慢請求拖垮所有連線 | `server.js` 多處 | 🔴 高 |
| 2 | 功能 | 影音檔被 `res.download()` 強制下載，無法在瀏覽器內串流預覽；無 HTTP Range 支援 | `server.js:495-506` | 🔴 高 |
| 3 | 安全 | 密碼明文比對且明文存檔；無 hash | `lib/auth.js:74` | 🟡 中 |
| 4 | 安全 | 登入無速率限制，可暴力破解 | `lib/auth.js:72` | 🟡 中 |
| 5 | 安全 | `resolveSafePath` 只做字串前綴比對，未解析符號連結，share 內 symlink 可逃逸至外部 | `lib/path-utils.js:17` | 🟡 中 |
| 6 | 效能/穩定 | `/api/search` 遞迴無深度上限、無 symlink 循環防護，深層或循環目錄可能爆量 | `server.js:315-333` | 🟡 中 |
| 7 | 功能 | 缺少「重新命名 / 移動」檔案與資料夾 | 無 | 🟡 中 |
| 8 | 功能 | 缺少資料夾打包 ZIP 下載 | 無 | 🟢 低 |
| 9 | 品質 | `lib/auth.js` 與所有 API 路由無測試（僅純函式有測試） | `test/` | 🟡 中 |
| 10 | 品質 | 版本不一致：`package.json` = `1.0.0`，`server.js` `VERSION` = `1.2.0` | `package.json:3` | 🟢 低 |
| 11 | 品質 | `mime-types` 列於 dependencies 但程式碼未使用 | `package.json:13` | 🟢 低 |
| 12 | 穩定 | 無 graceful shutdown（SIGTERM/SIGINT），systemd 重啟時連線硬斷 | `server.js:534` | 🟢 低 |
| 13 | 穩定 | `express.json({limit:'50mb'})` 對每個請求皆解析，含檔案上傳路由（雖 multer 另處理），可縮小限制 | `server.js:46` | 🟢 低 |

## 改善目標（v1.3.0）

1. **效能**：核心檔案操作改為非同步（`fs.promises`），避免事件迴圈阻塞。
2. **功能**：影音 HTTP Range 串流內嵌預覽。
3. **功能**：重新命名 / 移動 API 與前端 UI。
4. **安全**：密碼 hash（scrypt）+ 登入速率限制 + symlink 逃逸防護。
5. **穩定**：search 深度限制、graceful shutdown。
6. **品質**：`auth.js` 與 API 整合測試、版本統一、清除未使用依賴。

## 實作階段（提案，尚未執行）

```
Phase A ─ 安全強化
  ├── auth.js: scrypt 密碼 hash（相容明文舊檔，啟動時警告）
  ├── auth.js: 登入速率限制（per-IP 失敗計數 + 冷卻）
  └── path-utils.js: realpath 解析，防 symlink 逃逸

Phase B ─ 效能與穩定
  ├── server.js: list / search / content / save / delete 改 fs.promises
  ├── search: 深度上限 + visited set 防循環
  └── server.js: graceful shutdown（SIGTERM/SIGINT）

Phase C ─ 新功能
  ├── /files/* 影音 HTTP Range 串流 + 前端內嵌 <video>/<audio>
  ├── POST /api/rename（重新命名 / 移動）
  └── GET /api/download-zip（資料夾打包，需評估依賴）

Phase D ─ 品質與收尾
  ├── test/auth.test.js + test/api.test.js（supertest 或內建 http）
  ├── 版本統一 1.3.0、移除未使用依賴
  └── 依 test.md 驗收、更新 final.md 為實作報告
```

## 不在本次範圍

- 完整 RBAC / 多使用者管理
- 前端框架化（React/Vue）
- HTTPS / TLS 終止（建議由反向代理處理）
- 資料庫 / 持久化 session（家用場景記憶體即可）
- 縮圖 / 影片轉碼

## 成功標準（實作後才驗證）

- [ ] `npm test` 全數通過（含新增 auth / API 測試）
- [ ] 影音可於瀏覽器內串流預覽（Range 206 回應）
- [ ] symlink 指向 share 外的路徑存取被拒（403）
- [ ] 登入連續失敗達門檻後被限制
- [ ] 密碼以 hash 儲存；明文舊檔可讀但啟動時警告
- [ ] 大目錄列表不阻塞其他並發請求
- [ ] `/api/rename` 可重新命名與移動
- [ ] `package.json` 與 `server.js` 版本一致為 1.3.0

## 風險與相依

| 項目 | 風險 | 緩解 |
|------|------|------|
| 同步→非同步改寫 | 可能引入 race / 遺漏錯誤處理 | 逐路由改、每步跑測試 |
| 密碼 hash 遷移 | 舊明文檔相容 | 偵測格式，明文則警告並仍可登入 |
| ZIP 下載 | 可能需新依賴（archiver） | 先評估；家用場景可延後或用系統 zip |
| Range 串流 | 邊界處理錯誤 | 完整單元/手動測試各種 Range 標頭 |
