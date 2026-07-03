# LAN Share 改善計畫

## 專案現況摘要

LAN Share 是一鍵部署的家用區域網路檔案伺服器，提供：

- **Samba (SMB)**：桌機掛載網路磁碟
- **Node.js Web UI**：瀏覽器檔案管理（上傳、預覽、編輯、搜尋、C2PA 清除）

技術棧：Bash (`setup.sh`) + Express + 原生 HTML/CSS/JS。

## 發現的問題

| 類別 | 問題 | 嚴重度 |
|------|------|--------|
| 部署 | `setup.sh` 使用 `WEB_PORT`，但 systemd 未傳 `--port`，Web 永遠跑 8080 | 🔴 高 |
| 文件 | README 寫 `FB_PORT` / `AUTH_METHOD`，與 `setup.sh` 不一致；`AUTH_METHOD` 未實作 | 🟡 中 |
| 安全 | 路徑檢查用 `startsWith(SHARE_DIR)`，未 `resolve` 正規化，存在目錄遍歷風險 | 🔴 高 |
| 安全 | 無認證機制，LAN 內任意裝置可刪除/覆寫檔案 | 🟡 中 |
| 品質 | 無自動化測試；`crypto` 已 import 未使用 | 🟡 中 |
| 可靠性 | Multer 超過大小限制時無友善錯誤回應 | 🟢 低 |
| 可觀測 | 無 health check，難以監控服務狀態 | 🟢 低 |
| UX | 前端硬編碼 500MB；上傳失敗訊息不明確 | 🟢 低 |

## 改善目標

1. **修正部署與環境變數不一致**（`WEB_PORT` / `FB_PORT` 雙向相容）
2. **強化路徑安全**（集中 `resolveSafePath` 工具）
3. **補齊 API 基礎設施**（`/api/health`、`/api/info`）
4. **建立測試基礎**（`categorize`、`normalizeFilename`、`path-utils`、`stripC2pa`）
5. **改善錯誤處理與前端資訊同步**
6. **實作輕量密碼認證**（對應 README 的 `AUTH_METHOD=json`）

## 實作階段

```
Phase 1 ─ 安全與部署修復
  ├── path-utils.js + 全面替換路徑檢查
  ├── setup.sh 傳遞 port / auth 環境變數
  └── 環境變數 WEB_PORT ↔ FB_PORT 相容

Phase 2 ─ API 與可靠性
  ├── /api/health, /api/info
  ├── Multer / Express 錯誤中介層
  └── 輕量 JSON 密碼認證（可選啟用）

Phase 3 ─ 測試與驗收
  ├── Node.js 內建 test runner
  ├── npm test script
  └── 依 test.md 驗收清單執行

Phase 4 ─ 文件收尾
  └── final.md 記錄變更與驗收結果
```

## 不在本次範圍

- 完整 RBAC / 多使用者管理
- 非同步 fs / 串流搜尋重構（大型目錄效能）
- 前端框架化（React/Vue）
- HTTPS / TLS 終止

## 成功標準

- [ ] `npm test` 全數通過
- [ ] 路徑遍歷攻擊被阻擋（`../` 等）
- [ ] `WEB_PORT=9090` 或 `FB_PORT=9090` 均可正確啟動
- [ ] `/api/health` 回傳 200
- [ ] `AUTH_METHOD=json` 時未登入無法存取 API
- [ ] `final.md` 記錄完整驗收結果