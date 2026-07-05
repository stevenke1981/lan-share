# LAN Share 改善規格 — v1.3.0（規劃提案）

> 狀態：**規劃階段，尚未實作**。以下規格描述預計變更的介面與行為。

## 1. 安全強化

### 1.1 密碼 hash（`lib/auth.js`）

現況：`login` 以明文 `password === credentials.password` 比對（`auth.js:74`）。

目標：改用 Node 內建 `crypto.scrypt` + 隨機 salt，格式：

```
scrypt$<saltHex>$<hashHex>
```

`.lan-share-auth.json` 支援兩種格式：

```jsonc
// 新格式（建議）
{ "username": "admin", "password": "scrypt$ab12...$cd34..." }
// 舊格式（相容，啟動時 console.warn 提醒改用 hash）
{ "username": "admin", "password": "plaintext-secret" }
```

- 提供 helper：`hashPassword(plain)` 與 `verifyPassword(plain, stored)`。
- `verifyPassword` 偵測前綴 `scrypt$` → hash 比對；否則視為明文比對（相容）。
- 使用 `crypto.timingSafeEqual` 防時序攻擊。
- `setup.sh` 產生 auth 檔時改寫入 hash（設定期即 hash）。

### 1.2 登入速率限制（`lib/auth.js`）

- 記憶體 `Map<ip, { fails, lockedUntil }>`。
- 連續失敗 `MAX_LOGIN_FAILS`（預設 5）→ 鎖定 `LOGIN_LOCK_MS`（預設 15 分鐘）。
- 鎖定期間回 `429 { error: 'Too many attempts, try again later' }`。
- 成功登入清除該 IP 計數。
- IP 取 `req.ip`（需 `app.set('trust proxy', ...)` 視部署而定；家用直連即 `req.socket.remoteAddress`）。

### 1.3 Symlink 逃逸防護（`lib/path-utils.js`）

現況：`resolveSafePath` 僅字串前綴比對（`path-utils.js:26`），若 share 內存在指向外部的符號連結，解析後字串仍在 prefix 內但實體在外。

目標：新增 `resolveRealSafePath(shareDir, relPath)`：

1. 先做現有字串層驗證（擋 `../`）。
2. 對已存在的目標以 `fs.realpathSync`（或 `fs.promises.realpath`）解析，再次確認 realpath 仍位於 `realpath(shareDir)` 內。
3. 目標尚不存在（如新建）時，對「最近的已存在父目錄」做 realpath 驗證。
4. 逃逸則拋 `PathTraversalError`（403）。

保留舊 `resolveSafePath` 供純字串測試；新函式用於實際檔案 I/O 路由。

## 2. 效能：非同步檔案操作（`server.js`）

將下列路由的核心 fs 呼叫由 `*Sync` 改為 `fs.promises` + `async/await`：

| 路由 | 現況 | 改為 |
|------|------|------|
| `GET /api/list` → `listDir` | `readdirSync`/`statSync` | `fs.promises.readdir(..,{withFileTypes})` + `stat` |
| `GET /api/search` → `walk` | 遞迴 `readdirSync` | 非同步遞迴 + 深度上限 |
| `GET /api/content` | `readFileSync` | `readFile` |
| `PUT /api/save` | `writeFileSync` | `writeFile` |
| `DELETE /api/delete` | `rmSync` | `rm` |
| `POST /api/mkdir` | `mkdirSync` | `mkdir` |

- 路由 handler 改 `async`，錯誤以 `try/catch` → `handleRouteError`。
- `strip-c2pa.js` 可維持同步（單檔、CPU-bound、體積小）——本次不強制改。

### 2.1 search 深度與循環防護

```
MAX_SEARCH_DEPTH = 12
MAX_SEARCH_RESULTS = 100（維持現值）
```

- `walk(dir, depth)`；`depth > MAX_SEARCH_DEPTH` 即停。
- 以 `visited` Set 記錄 realpath，避免 symlink 循環。

## 3. 新功能：影音 HTTP Range 串流

### `GET /files/*`（改寫）

現況：影音走 `res.download()` 強制下載（`server.js:502-503`）。

目標：支援 `Range` 標頭以利瀏覽器內串流：

- 無 `Range`：回 `200`，帶 `Content-Length`、`Content-Type`、`Accept-Ranges: bytes`。
- 有 `Range: bytes=start-end`：回 `206 Partial Content`，帶 `Content-Range`、`Content-Length`，以 `fs.createReadStream(path,{start,end})` 串流。
- 非法 Range：回 `416 Range Not Satisfiable`。
- 保留 `?download=1` query 參數強制下載（`Content-Disposition: attachment`）。
- Content-Type 以副檔名對照表（可用既存 `mime-types` 依賴，順帶讓其被實際使用）。

### 前端（`public/app.js` `previewFile`）

- 影片 → `<video controls src="/files/...">`；音訊 → `<audio controls>`。
- 下載按鈕改帶 `?download=1`。

## 4. 新功能：重新命名 / 移動

### POST `/api/rename`

```jsonc
// Request
{ "from": "Documents/a.txt", "to": "Documents/b.txt" }
// or move: { "from": "Documents/a.txt", "to": "Pictures/a.txt" }
```

- 兩路徑皆經 `resolveRealSafePath` 驗證。
- `to` 已存在 → `409 { error: 'Target already exists' }`。
- 來源不存在 → `404`。
- 成功 → `{ success: true, path: "<new rel path>" }`，使用 `fs.promises.rename`。

### 前端

- 檔案項目選單新增「重新命名」，以既有 modal 輸入新名稱。

## 5. 新功能：資料夾 ZIP 下載（可選 / 評估後決定）

### GET `/api/download-zip?path=<dir>`

- 驗證為 share 內目錄。
- 串流 ZIP（評估 `archiver` 依賴；若不願新增依賴則此功能延後至獨立提案）。
- `Content-Disposition: attachment; filename="<dir>.zip"`。

> 決策點：是否引入 `archiver`。預設**延後**，除非使用者確認可加依賴。

## 6. 穩定性

### 6.1 Graceful shutdown（`server.js`）

```js
const server = app.listen(PORT, '0.0.0.0', ...);
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
```

### 6.2 版本與依賴

- `package.json` `version` → `1.3.0`；`server.js` `VERSION` → `1.3.0`（單一來源：server 讀 `require('./package.json').version`）。
- `mime-types`：若 Range 串流使用則保留並實際引用；否則移除。

## 7. 環境變數（新增）

| 變數 | 預設 | 說明 |
|------|------|------|
| `MAX_LOGIN_FAILS` | `5` | 登入失敗鎖定門檻 |
| `LOGIN_LOCK_MS` | `900000` | 鎖定時間（15 分鐘） |
| `MAX_SEARCH_DEPTH` | `12` | search 遞迴深度上限 |

沿用 v1.2.0：`SHARE_DIR`、`FB_PORT`/`WEB_PORT`、`MAX_FILE_SIZE`、`AUTH_METHOD`、`AUTH_FILE`。

## 8. 測試規格

沿用 Node 內建 `node:test` + `node:assert`。新增：

| 測試檔 | 涵蓋 |
|--------|------|
| `test/auth.test.js` | hashPassword/verifyPassword、token 建立/驗證/過期、速率限制 |
| `test/path-utils.test.js`（擴充） | realpath symlink 逃逸案例 |
| `test/api.test.js` | list / mkdir / rename / delete / 403 遍歷 / Range 206（以 `http` 模組對 `app.listen(0)` 打實請求） |

`package.json` test script 維持 `node --test test/*.test.js`。

## 9. 版本

本次改善目標版本：**1.3.0**（實作後）。
