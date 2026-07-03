# LAN Share 改善待辦清單

## Phase 1：安全與部署

- [x] 撰寫 plan.md / spec.md / todos.md / test.md
- [x] 新增 `web-server/lib/path-utils.js`
- [x] 重構 `server.js` 使用 `resolveSafePath`
- [x] 移除未使用的 `crypto` import（改至 auth 模組使用）
- [x] `server.js` 支援 `WEB_PORT` 與 `FB_PORT`
- [x] 修正 `setup.sh` systemd 傳遞 `--port` 與環境變數
- [x] 統一 README 環境變數說明（`WEB_PORT` 為主，`FB_PORT` 相容）

## Phase 2：API 與認證

- [x] 新增 `web-server/lib/auth.js`（輕量 token 認證）
- [x] 實作 `GET /api/health`
- [x] 實作 `GET /api/info`
- [x] 實作 `POST /api/login`
- [x] 加入 Multer / 全域錯誤處理中介層
- [x] `setup.sh` 支援 `AUTH_METHOD` 並產生範例 auth 檔

## Phase 3：測試

- [x] 新增 `test/categorize.test.js`
- [x] 新增 `test/path-utils.test.js`
- [x] 新增 `test/strip-c2pa.test.js`
- [x] `package.json` 加入 `npm test`
- [x] 執行 `npm test` 全數通過（17/17）

## Phase 4：前端

- [x] `app.js` 載入 `/api/info` 動態顯示上限
- [x] 認證 fetch 包裝與登入 UI
- [x] 改善上傳錯誤訊息

## Phase 5：驗收

- [x] 依 test.md 手動驗收
- [x] 撰寫 final.md