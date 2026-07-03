# LAN Share 🏠📁

> 一行指令建立家用區域網路檔案伺服器。
> 讓 Windows、macOS、Linux、手機、平板都能存取同一份檔案 — 不需雲端。

---

## 功能概述

執行一個腳本後，這台 Ubuntu 機器會變成區域網路檔案伺服器，提供 **兩種存取方式**：

| 方式 | 怎麼連 | 適合 |
|------|--------|------|
| **Samba (SMB)** | 檔案總管 / Finder 掛載成網路磁碟機 | 桌機、筆電 |
| **Web UI** | 瀏覽器開啟 `http://IP:8080` | 手機、平板、任何裝置 |

## 快速開始

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/<你的帳號>/lan-share/main/setup.sh)
```

或直接下載執行：

```bash
git clone https://github.com/<你的帳號>/lan-share.git
cd lan-share
bash setup.sh
```

就是這麼簡單。完成後畫面上會顯示 IP 位址。

---

## 如何連線

### 📂 SMB 網路磁碟機

| 系統 | 步驟 |
|------|------|
| **Windows** | 檔案總管 → 輸入 `\\<IP>\shared` → Enter |
| **macOS** | Finder → 前往 → 連接伺服器 (`Cmd+K`) → `smb://<IP>/shared` |
| **Linux** | 檔案管理員 → `smb://<IP>/shared` |
| **指令掛載** | `sudo mount -t cifs //<IP>/shared /mnt/lan_share -o guest` |

### 🌐 Web 瀏覽器

開啟瀏覽器，前往：

```
http://<IP>:8080
```

預設不需登入（可設定密碼驗證）。

---

## 設定選項

透過環境變數自訂：

```bash
# 指定分享目錄（預設：/mnt/lan-share）
SHARE_DIR=/data/share bash setup.sh

# 更換 Web 埠號（預設：8080）
FB_PORT=9090 bash setup.sh

# 啟用密碼登入
AUTH_METHOD=json bash setup.sh

# 非互動模式（跳過確認）
bash setup.sh --yes
```

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SHARE_DIR` | `/mnt/lan-share` | 分享目錄路徑 |
| `FB_PORT` | `8080` | Web 介面連接埠 |
| `SMB_NAME` | `shared` | Samba 分享名稱 |
| `AUTH_METHOD` | `noauth` | `noauth`（免登入）或 `json`（密碼登入） |

---

## 專案結構

```
lan-share/
├── setup.sh              # 🚀 一鍵安裝腳本
├── README.md             # 英文說明
├── README.zh-TW.md       # 繁體中文說明（就是你正在看的）
└── docs/
    └── connect-guide.md  # 各平台連線詳細教學
```

---

## 系統需求

- Ubuntu 20.04 以上（或 Debian 系列）
- 擁有 `sudo` 權限的使用者
- 需網路連線以下載套件

## 運作原理

1. 建立分享目錄（預設：`/mnt/lan-share/`）
2. 安裝並設定 **Samba** — 業界標準的 SMB 通訊協定
3. 安裝 **Node.js 網頁檔案瀏覽器**，支援拖曳上傳（以 systemd 服務執行）
4. 在分享目錄中產生 `README.txt`，內含各平台連線方式

兩個服務都會在開機時自動啟動。

---

## 移除

```bash
# 停止並停用服務
sudo systemctl stop lan-share-web smbd
sudo systemctl disable lan-share-web smbd

# 移除套件
sudo apt-get remove samba samba-common smbclient

# 移除網頁伺服器
sudo rm /etc/systemd/system/lan-share-web.service
sudo rm -rf /home/<你的帳號>/lan-share

# 移除分享目錄（若你改過路徑請自行調整）
sudo rm -rf /mnt/lan-share
```

---

## 授權條款

MIT
