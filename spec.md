# LAN Share 改善規格

## 1. 路徑安全模組 (`web-server/lib/path-utils.js`)

### `resolveSafePath(shareDir, relativePath)`

將使用者提供的相對路徑解析為絕對路徑，並驗證仍在分享目錄內。

```js
function resolveSafePath(shareDir, relativePath) {
  const base = path.resolve(shareDir);
  const resolved = path.resolve(base, relativePath || '.');
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  if (resolved !== base && !resolved.startsWith(prefix)) {
    throw new PathTraversalError('Access denied');
  }
  return resolved;
}
```

**套用範圍**：所有 `/api/*` 與 `/files/*` 路由。

---

## 2. 環境變數規格

| 變數 | 別名 | 預設 | 說明 |
|------|------|------|------|
| `SHARE_DIR` | — | `/mnt/lan-share` | 分享根目錄 |
| `FB_PORT` | `WEB_PORT` | `8080` | Web 埠號（兩者擇一，FB_PORT 優先） |
| `MAX_FILE_SIZE` | — | `524288000` (500MB) | 單檔上傳上限 |
| `AUTH_METHOD` | — | `noauth` | `noauth` 或 `json` |
| `AUTH_FILE` | — | `{SHARE_DIR}/.lan-share-auth.json` | 帳密 JSON 路徑 |

### `setup.sh` systemd 服務

```ini
Environment=SHARE_DIR=...
Environment=FB_PORT=...
Environment=AUTH_METHOD=...
ExecStart=... server.js --dir $SHARE_DIR --port $WEB_PORT
```

---

## 3. 認證規格（`AUTH_METHOD=json`）

### 帳密檔格式 (`.lan-share-auth.json`)

```json
{
  "username": "admin",
  "password": "your-secret-password"
}
```

> 家用 LAN 場景：明文密碼存於伺服器本機，透過 HTTPS 以外管道設定。生產環境建議改為 hash。

### API

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/login` | Body: `{username, password}` → 回傳 `{token}` |
| POST | `/api/logout` | 清除 session（可選） |
| GET | `/api/health` | 永遠公開，不需認證 |

### Session

- 使用 `crypto.randomBytes(32)` 產生 token
- 記憶體 Map 儲存（重啟失效，符合家用場景）
- 前端以 `Authorization: Bearer <token>` 或 `X-Auth-Token` header 傳送
- 未認證時 `/api/*`（除 health/login）回傳 `401`

### 前端

- 啟動時呼叫 `/api/info`，若 `auth_required: true` 且無 token，顯示登入 modal
- Token 存 `localStorage`

---

## 4. 新增 API

### GET `/api/health`

```json
{
  "status": "ok",
  "uptime": 123.45,
  "share_dir": "/mnt/lan-share"
}
```

### GET `/api/info`

```json
{
  "name": "LAN Share",
  "version": "1.2.0",
  "share_dir": "/mnt/lan-share",
  "max_file_size": 524288000,
  "max_file_size_human": "500 MB",
  "auth_required": false
}
```

---

## 5. 錯誤處理

### Multer `LIMIT_FILE_SIZE`

```json
{ "error": "File too large. Maximum size is 500 MB" }
```
HTTP 413

### 路徑遍歷

HTTP 403 `{ "error": "Access denied" }`

---

## 6. 測試規格

使用 Node.js 內建 `node:test` + `node:assert`。

| 測試檔 | 涵蓋 |
|--------|------|
| `test/categorize.test.js` | 副檔名分類、中文檔名正規化 |
| `test/path-utils.test.js` | 正常路徑、遍歷阻擋、空路徑 |
| `test/strip-c2pa.test.js` | JPEG/PNG 處理（合成 buffer） |

`package.json`:

```json
"scripts": {
  "start": "node server.js",
  "test": "node --test test/*.test.js"
}
```

---

## 7. 前端變更

- 啟動時載入 `/api/info`，動態顯示上傳大小上限
- `fetch` 包裝器自動附加 auth token
- 登入 modal（僅 `auth_required` 時）
- 上傳失敗解析 JSON error message

---

## 8. 版本

本次改善版本：**1.2.0**