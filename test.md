# LAN Share 測試與驗收計畫

## 自動化測試

### 執行方式

```bash
cd web-server
npm test
```

### 測試案例

#### `categorize.test.js`

| ID | 案例 | 預期 |
|----|------|------|
| C01 | `photo.jpg` | `Pictures` |
| C02 | `video.mp4` | `Videos` |
| C03 | `song.mp3` | `Music` |
| C04 | `readme.md` | `Documents` |
| C05 | `archive.zip` | `Downloads` |
| C06 | `Dockerfile` | `Projects` |
| C07 | `unknown.xyz` | `Downloads` |
| C08 | NFC 正規化中文檔名 | 正確 Unicode 字元 |

#### `path-utils.test.js`

| ID | 案例 | 預期 |
|----|------|------|
| P01 | `""` → 根目錄 | 回傳 shareDir |
| P02 | `"Documents/a.txt"` | 合法子路徑 |
| P03 | `"../etc/passwd"` | 拋出 PathTraversalError |
| P04 | `"foo/../../outside"` | 拋出 PathTraversalError |
| P05 | 符號連結風格 `subdir/../subdir/file` | 合法（仍在目錄內） |

#### `strip-c2pa.test.js`

| ID | 案例 | 預期 |
|----|------|------|
| S01 | 最小合法 JPEG buffer | `stripC2pa` 回傳 true，輸出檔存在 |
| S02 | 最小合法 PNG buffer | `stripC2pa` 回傳 true |
| S03 | 非圖片副檔名 | copy as-is 回傳 true |

---

## 手動驗收（本機 Windows 開發環境）

### 環境準備

```powershell
$shareDir = "$env:TEMP\lan-share-test"
New-Item -ItemType Directory -Force -Path $shareDir
cd D:\lan-share\web-server
npm install
```

### API 驗收

| ID | 步驟 | 預期 |
|----|------|------|
| M01 | `node server.js --dir $shareDir --port 8765` | 啟動成功，印出 LAN 位址 |
| M02 | `GET http://localhost:8765/api/health` | `{"status":"ok",...}` |
| M03 | `GET http://localhost:8765/api/info` | 含 `max_file_size_human` |
| M04 | `GET http://localhost:8765/api/list` | 回傳空目錄或子資料夾 |
| M05 | `GET /api/list?path=../` | HTTP 403 |
| M06 | `POST /api/mkdir` 建立資料夾 | 成功 |
| M07 | 上傳小檔案 | 自動分類至對應目錄 |
| M08 | `DELETE /api/delete` | 刪除成功 |

### 認證驗收（`AUTH_METHOD=json`）

| ID | 步驟 | 預期 |
|----|------|------|
| A01 | 設定 auth 檔 + `AUTH_METHOD=json` 啟動 | 服務啟動 |
| A02 | 未帶 token 呼叫 `/api/list` | HTTP 401 |
| A03 | `POST /api/login` 正確帳密 | 回傳 token |
| A04 | 帶 token 呼叫 `/api/list` | HTTP 200 |
| A05 | `GET /api/health` 無 token | HTTP 200（公開） |

### 前端驗收

| ID | 步驟 | 預期 |
|----|------|------|
| F01 | 開啟 `http://localhost:8765` | 檔案列表正常顯示 |
| F02 | 上傳區 hint | 顯示與 `/api/info` 一致的大小上限 |
| F03 | 拖放上傳 | 進度條 + 成功 toast |
| F04 | 搜尋檔名 | 結果正確 |

---

## 驗收通過條件

1. 所有自動化測試通過（0 failures）
2. M01–M08 手動驗收通過
3. A01–A05 認證驗收通過（若實作）
4. 無 regression：既有上傳/預覽/刪除功能正常

---

## 已知限制

- 認證 token 存於記憶體，服務重啟後需重新登入
- 手動驗收在 Windows 上以 Node 直接啟動，非完整 Ubuntu systemd 流程
- Samba 相關功能需在 Linux 目標機實機驗證