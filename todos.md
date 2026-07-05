# LAN Share 改善待辦清單 — v1.3.0（已完成）

> 狀態：**全部已實作並驗證**。66 項測試通過。

## Phase A：安全強化

- [x] `lib/auth.js`：新增 `hashPassword` / `verifyPassword`（scrypt + salt）
- [x] `lib/auth.js`：`login` 改用 `verifyPassword`，相容明文舊檔並啟動警告
- [x] `lib/auth.js`：登入速率限制（per-IP 失敗計數 + 冷卻，429）
- [x] `lib/path-utils.js`：新增 `resolveRealSafePath`（realpath 防 symlink 逃逸）
- [x] `server.js`：實際 I/O 路由改用 `resolveRealSafePath`

## Phase B：效能與穩定

- [x] `server.js`：`listDir` 改 `fs.promises`
- [x] `server.js`：`/api/search` 改非同步 + 深度上限 + 循環防護
- [x] `server.js`：`/api/content`、`/api/save`、`/api/delete`、`/api/mkdir` 改非同步
- [x] `server.js`：graceful shutdown（SIGTERM/SIGINT）

## Phase C：新功能

- [x] `server.js`：`GET /files/*` 支援 HTTP Range（206）+ `?download=1`
- [x] `public/app.js`：影音改內嵌 `<video>`/`<audio>` 預覽（已存在，現可正常串流）
- [x] `server.js`：`POST /api/rename`（重新命名 / 移動，含 EXDEV cross-device）
- [x] `public/app.js` + `index.html`：重新命名 UI

## Phase D：品質與收尾

- [x] `test/auth.test.js`：hash、token、速率限制（21 項）
- [x] `test/path-utils.test.js`：擴充 symlink 逃逸案例
- [x] `test/api.test.js`：list / mkdir / rename / delete / 遍歷 403 / Range 206（22 項）
- [x] 版本統一 1.3.0（`server.js` 讀 `package.json.version`）
- [x] `mime-types` 已用於 Range 串流的 Content-Type
- [x] `npm test`：**66/66 通過**
- [x] 依 `test.md` 驗收完成
- [x] `final.md` 更新為實作驗收報告
