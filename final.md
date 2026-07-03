# LAN Share 改善驗收報告

**版本**：1.2.0  
**日期**：2026-07-04  
**狀態**：✅ 驗收通過

---

## 執行摘要

依 `plan.md` 完成四階段改善：安全修復、API/認證補齊、自動化測試、前端同步。所有自動化測試通過，本機 API 手動驗收通過。

---

## 變更清單

### 新增檔案

| 檔案 | 說明 |
|------|------|
| `plan.md` | 改善計畫與問題分析 |
| `spec.md` | 技術規格 |
| `todos.md` | 待辦追蹤 |
| `test.md` | 測試與驗收計畫 |
| `web-server/lib/path-utils.js` | 安全路徑解析 |
| `web-server/lib/auth.js` | 輕量 token 認證 |
| `web-server/test/*.test.js` | 17 項單元測試 |

### 修改檔案

| 檔案 | 變更 |
|------|------|
| `web-server/server.js` | 路徑安全、health/info/login API、認證中介層、錯誤處理、port 相容 |
| `web-server/package.json` | 新增 `npm test` |
| `web-server/public/app.js` | 認證、動態上傳上限、錯誤訊息改善 |
| `web-server/public/index.html` | 登入 modal、動態 hint |
| `setup.sh` | 傳遞 `--port`、AUTH 支援、systemd 環境變數 |
| `README.md` / `README.zh-TW.md` | 環境變數文件統一 |

---

## 驗收結果

### 自動化測試

```
cd web-server && npm test
→ 17 tests, 17 pass, 0 fail
```

| 套件 | 結果 |
|------|------|
| categorize.test.js | ✅ 9/9 |
| path-utils.test.js | ✅ 5/5 |
| strip-c2pa.test.js | ✅ 3/3 |

### 手動 API 驗收（Windows 本機）

| ID | 案例 | 結果 |
|----|------|------|
| M01 | 啟動 `--port 8765` | ✅ |
| M02 | `GET /api/health` → 200 | ✅ |
| M03 | `GET /api/info` 含 `max_file_size_human` | ✅ |
| M04 | `GET /api/list` → 200 | ✅ |
| M05 | `GET /api/list?path=../` → 403 | ✅ |
| M06 | `POST /api/mkdir` | ✅ |
| M07 | 目錄列表顯示新資料夾 | ✅ |

### 認證驗收

| ID | 案例 | 結果 |
|----|------|------|
| A01 | `AUTH_METHOD=json` 啟動 | ✅ |
| A02 | 未帶 token → `/api/list` 401 | ✅ |
| A03 | `POST /api/login` 正確帳密 → token | ✅ |
| A04 | 帶 Bearer token → `/api/list` 200 | ✅ |
| A05 | 無 token → `/api/health` 200 | ✅ |

---

## 已解決問題

1. **setup.sh 未傳 port** → systemd 現傳 `--port $WEB_PORT`
2. **WEB_PORT / FB_PORT 不一致** → 伺服器雙向相容，文件以 `WEB_PORT` 為主
3. **路徑遍歷風險** → `resolveSafePath` 集中驗證
4. **AUTH_METHOD 未實作** → JSON 帳密檔 + Bearer token
5. **無測試** → Node 內建 test runner，17 項測試
6. **無 health/info** → 新增監控端點
7. **上傳錯誤不明** → Multer 413 + 前端 JSON 解析

---

## 剩餘風險與建議

| 項目 | 說明 | 建議 |
|------|------|------|
| 認證密碼明文 | 家用場景可接受 | 未來可改 bcrypt hash |
| Token 記憶體儲存 | 重啟失效 | 可選 Redis/檔案持久化 |
| 同步 fs | 大目錄阻塞 | 非同步重構列為後續 |
| Samba 部署 | 僅在 Linux 驗證 | 目標機執行 `setup.sh` 實機確認 |

---

## 快速驗證指令

```bash
# 單元測試
cd web-server && npm test

# 本機啟動（開發）
node server.js --dir /path/to/share --port 8080

# 啟用認證
AUTH_METHOD=json node server.js --dir /path/to/share
# 帳密檔：{SHARE_DIR}/.lan-share-auth.json

# 正式部署（Ubuntu）
WEB_PORT=9090 AUTH_METHOD=json bash setup.sh --yes
```