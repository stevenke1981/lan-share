# LAN Share 測試與驗收計畫 — v1.3.0（規劃提案）

> 狀態：**規劃階段，尚未執行**。本文件定義實作後應通過的測試與驗收條件。

## 自動化測試

### 執行方式

```bash
cd web-server
npm test          # node --test test/*.test.js
```

### 新增/擴充測試案例

#### `test/auth.test.js`（新增）

| ID | 案例 | 預期 |
|----|------|------|
| AU01 | `hashPassword('x')` 產生 `scrypt$salt$hash` 格式 | 三段、前綴 `scrypt` |
| AU02 | `verifyPassword('x', hash)` 正確密碼 | `true` |
| AU03 | `verifyPassword('y', hash)` 錯誤密碼 | `false` |
| AU04 | `verifyPassword('x', 'x')` 明文相容 | `true` |
| AU05 | 建立 token → `isValidToken` | `true` |
| AU06 | 過期 token（改 createdAt）| `false` 並被刪除 |
| AU07 | 連續失敗達門檻 | 之後回 429 / 鎖定 |
| AU08 | 成功登入清除失敗計數 | 計數歸零 |

#### `test/path-utils.test.js`（擴充既有 5 案例）

| ID | 案例 | 預期 |
|----|------|------|
| P01 | `""` → 根目錄 | 回傳 shareDir |
| P02 | `"Documents/a.txt"` | 合法子路徑 |
| P03 | `"../etc/passwd"` | 拋 PathTraversalError |
| P04 | `"foo/../../outside"` | 拋 PathTraversalError |
| P05 | `subdir/../subdir/file` | 合法 |
| P06 | share 內 symlink 指向外部 → `resolveRealSafePath` | 拋 PathTraversalError |
| P07 | share 內 symlink 指向內部 | 合法 |

#### `test/api.test.js`（新增，以 `app.listen(0)` + `http` 打實請求）

| ID | 案例 | 預期 |
|----|------|------|
| API01 | `GET /api/health` | 200 `{status:'ok'}` |
| API02 | `GET /api/list` | 200，含 items |
| API03 | `GET /api/list?path=../` | 403 |
| API04 | `POST /api/mkdir` | 200 建立成功 |
| API05 | `POST /api/rename` 重新命名 | 200，新路徑存在 |
| API06 | `POST /api/rename` 目標已存在 | 409 |
| API07 | `DELETE /api/delete` | 200 |
| API08 | `GET /files/<video>` 帶 `Range: bytes=0-99` | 206 + `Content-Range` |
| API09 | `GET /files/<video>?download=1` | 200 + `Content-Disposition: attachment` |
| API10 | 非法 Range | 416 |

#### `test/categorize.test.js` / `test/strip-c2pa.test.js`

- 維持 v1.2.0 既有案例，確保無 regression。

---

## 手動驗收

### 環境準備

```bash
cd web-server
npm install
mkdir -p /tmp/lan-share-test
node server.js --dir /tmp/lan-share-test --port 8765
```

### 功能驗收

| ID | 步驟 | 預期 |
|----|------|------|
| M01 | 啟動 `--port 8765` | 啟動成功，印出 LAN 位址 |
| M02 | 上傳一個 mp4 → 於瀏覽器點預覽 | `<video>` 內嵌可播放（串流，非下載） |
| M03 | 拖動影片進度條 | 產生 206 Range 請求，可跳播 |
| M04 | 點下載按鈕 | `?download=1`，檔案下載 |
| M05 | 重新命名檔案 | 列表即時更新為新名稱 |
| M06 | 移動檔案至其他資料夾（rename 跨目錄）| 成功 |
| M07 | 大目錄（數千檔）列表時同時開另一請求 | 兩者皆有回應（非同步不阻塞）|
| M08 | search 於深層目錄 | 有結果且不逾時 |

### 安全驗收

| ID | 步驟 | 預期 |
|----|------|------|
| S01 | `AUTH_METHOD=json` + hash 密碼檔啟動 | 服務啟動 |
| S02 | 錯誤密碼登入連續 5 次 | 第 6 次回 429 |
| S03 | 正確密碼登入 | 回 token，計數清除 |
| S04 | 於 share 內建立指向 `/etc` 的 symlink，存取 | 403 |
| S05 | 明文密碼舊檔啟動 | 可登入但 console 出現 hash 警告 |
| S06 | 未帶 token 呼叫 `/api/list`（auth 啟用）| 401 |

### 穩定性驗收

| ID | 步驟 | 預期 |
|----|------|------|
| T01 | `kill -SIGTERM <pid>` | 連線收尾後正常退出（graceful） |
| T02 | `GET /api/health` 檢查版本 | `version: '1.3.0'` |

---

## 驗收通過條件

1. 所有自動化測試通過（0 failures），含新增 auth / api 測試。
2. M01–M08 功能驗收通過。
3. S01–S06 安全驗收通過。
4. T01–T02 穩定性驗收通過。
5. 無 regression：既有上傳/預覽/編輯/刪除/搜尋/C2PA 功能正常。

## 已知限制（延續）

- Token 存記憶體，重啟需重新登入。
- 速率限制計數存記憶體，重啟歸零。
- Samba 相關功能需在 Linux 目標機實機驗證。
- ZIP 下載視依賴決策，可能延後至獨立提案。
