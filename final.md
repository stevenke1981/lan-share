# LAN Share v1.3.0 — 驗收報告

**版本**：1.3.0  
**日期**：2026-07-05  
**狀態**：✅ 全部驗收通過

---

## 執行摘要

根據 `plan.md` 完成四階段改善：安全強化、效能非同步化、新功能（Range 串流/重新命名）、測試補齊。自動化測試 66 項全數通過。

---

## 變更清單

### 新增檔案

| 檔案 | 說明 |
|------|------|
| `test/auth.test.js` | 密碼 hash、token 管理、速率限制（21 項測試） |
| `test/api.test.js` | API 整合測試（22 項測試，含 rename/Range/遍歷防護） |

### 修改檔案

| 檔案 | 變更 |
|------|------|
| `web-server/lib/auth.js` | scrypt hash 密碼、`timingSafeEqual`、per-IP 速率限制、明文相容警告、匯出 `hashPassword`/`verifyPassword` |
| `web-server/lib/path-utils.js` | 新增 `resolveRealSafePath`（realpath 防 symlink 逃逸）、`resolveRealSafeParent`（新建目錄安全路徑） |
| `web-server/server.js` | 全面非同步化（`fs.promises`）、HTTP Range 206 串流、`/api/rename`、搜尋深度/循環防護、`express.json` 限縮至 10mb、版本統一讀取 `package.json`、graceful shutdown、`download=1` 查詢參數、`mime-types` 用於 Content-Type |
| `web-server/public/app.js` | 重新命名 UI（showRenameModal）、下載按鈕 `?download=1`、Escape 關閉 rename modal、rename modal DOM refs |
| `web-server/public/index.html` | 重新命名 modal |
| `web-server/package.json` | 版本 `1.0.0` → `1.3.0` |

### 未更動

- `setup.sh`（設計上由部署時手動產生 hash，非自動）
- `web-server/strip-c2pa.js`（同步處理小檔 OK）
- `web-server/categorize.js`（無需改動）
- `web-server/public/style.css`
- `.gitignore`

---

## 驗收結果

### 自動化測試（`cd web-server && npm test`）

```
# tests 66
# pass 66
# fail 0
```

| 套件 | 測試數 | 結果 |
|------|--------|------|
| `categorize.test.js` | 9 | ✅ |
| `path-utils.test.js` | 11 | ✅（含 symlink 逃逸 4 項） |
| `strip-c2pa.test.js` | 3 | ✅ |
| `auth.test.js` | 21 | ✅（hash/驗證/token/速率限制/credentials） |
| `api.test.js` | 22 | ✅（health/info/list/mkdir/rename/delete/content/save/search/files/Range/404/403） |

### 驗收項目對照

| plan.md 成功標準 | 狀態 |
|-------------------|------|
| `npm test` 全數通過 | ✅ 66/66 |
| symlink 指向外部被阻擋（403） | ✅ 測試驗證 |
| 影音可內嵌串流（Range 206） | ✅ `/files/*` 實作 + API 測試 |
| 重新命名 API (`/api/rename`) | ✅ 功能 + 測試（含跨目錄、404、409） |
| 登入連續失敗達門檻後被限制 | ✅ auth 測試驗證 |
| 密碼以 hash 儲存，明文相容警告 | ✅ `loadCredentials` 警告 + `verifyPassword` 相容 |
| 大目錄列表不阻塞其他請求 | ✅ 全面 `fs.promises` 非同步 |
| 搜尋深度/循環防護 | ✅ 深度 12 + `visited` Set |
| 版本一致為 1.3.0 | ✅ `package.json` + `server` 一致 |
| Graceful shutdown | ✅ SIGTERM/SIGINT 處理 |

---

## 已解決問題

1. **全面同步 fs 阻塞事件迴圈** → `fs.promises` + `async/await`（list/search/content/save/delete/mkdir/upload-edited）
2. **影音強制下載無法預覽** → HTTP Range 206 串流 + `?download=1` 保留下載
3. **密碼明文比對** → `crypto.scryptSync` + `timingSafeEqual` + 明文相容（附警告）
4. **登入無速率限制** → per-IP 失敗計數 + 鎖定（429）
5. **Symlink 逃逸路徑** → `resolveRealSafePath` 以 `realpathSync` 雙層驗證
6. **搜尋無深度限制** → `MAX_SEARCH_DEPTH=12` + `visited` 循環防護
7. **無重新命名/移動 API** → `POST /api/rename`（含 EXDEV 跨裝置處理）
8. **無 graceful shutdown** → `SIGTERM`/`SIGINT` handler
9. **版本不一致** → `server.js` 讀 `package.json.version`
10. **認證/API 無測試** → auth 21 項 + API 22 項整合測試
11. **`express.json` 限度過大** → 50mb 縮為 10mb（上傳走 multer）

---

## 剩餘風險與建議

| 項目 | 說明 | 建議 |
|------|------|------|
| Token 記憶體儲存 | 重啟失效 | 可選 Redis/檔案持久化 |
| ZIP 資料夾下載 | 未實作（需 `archiver` 依賴） | 獨立提案 |
| 多使用者/RBAC | 僅單一帳號 | 家用場景 OK；未來可擴充 |
| CORS | 未設定 | 家用 LAN 不須跨域；若需反向代理則考慮 |

---

## 快速驗證指令

```bash
# 單元 + 整合測試（66 項）
cd web-server && npm test

# 本機啟動
node server.js --dir /path/to/share --port 8080

# 啟用 hash 密碼認證
AUTH_METHOD=json node server.js --dir /path/to/share
# 密碼檔：{SHARE_DIR}/.lan-share-auth.json
# 內容格式：{"username":"admin","password":"scrypt$<salt>$<hash>"}
# 可用內附工具產生 hash：
#   node -e "const {hashPassword}=require('./lib/auth'); console.log(hashPassword('your-password'))"

# 正式部署（Ubuntu）
bash setup.sh --yes
```
