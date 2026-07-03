# LAN Share 🏠📁

> One-command setup for a home network file server on Ubuntu.
> Share files across Windows, macOS, Linux, phones, and tablets — no cloud required.

---

## What it does

After running one script, your Ubuntu machine becomes a LAN file server with **two access methods**:

| Method | How users connect | Best for |
|--------|-------------------|----------|
| **Samba (SMB)** | Network drive mounted in File Explorer / Finder | Desktop computers |
| **Web UI** | Any web browser at `http://IP:8080` | Phones, tablets, any device |



## Quick start

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/<your-username>/lan-share/main/setup.sh)
```

Or clone and run:

```bash
git clone https://github.com/<your-username>/lan-share.git
cd lan-share
bash setup.sh
```

That's it. After completion, you'll see your server's IP address.

---

## How to connect

### 📂 SMB Network Drive

| OS | Steps |
|----|-------|
| **Windows** | File Explorer → type `\\<IP>\shared` → Enter |
| **macOS** | Finder → Go → Connect to Server (`Cmd+K`) → `smb://<IP>/shared` |
| **Linux** | File manager → `smb://<IP>/shared` |
| **Mount (any)** | `sudo mount -t cifs //<IP>/shared /mnt/lan_share -o guest` |

### 🌐 Web UI

Open your browser and go to:

```
http://<IP>:8080
```

No login required by default (configurable).

---

## Configuration

You can customize the setup via environment variables:

```bash
# Use a different directory (default: /mnt/lan-share)
SHARE_DIR=/data/share bash setup.sh

# Change web UI port (default: 8080)
WEB_PORT=9090 bash setup.sh
# FB_PORT is also supported as an alias

# Enable password authentication
AUTH_METHOD=json AUTH_PASSWORD=your-secret bash setup.sh

# Non-interactive mode
bash setup.sh --yes
```

| Variable | Default | Description |
|----------|---------|-------------|
| `SHARE_DIR` | `/mnt/lan-share` | Path to the shared directory |
| `WEB_PORT` | `8080` | Port for the web UI (`FB_PORT` alias supported) |
| `SMB_NAME` | `shared` | Name of the Samba share |
| `AUTH_METHOD` | `noauth` | `noauth` (open) or `json` (password login) |
| `AUTH_PASSWORD` | _(prompted)_ | Password when `AUTH_METHOD=json` |

---

## Project layout

```
lan-share/
├── setup.sh              # 🚀 One-command setup script
├── README.md             # This file
├── README.zh-TW.md       # 繁體中文說明
└── docs/
    └── connect-guide.md  # Detailed connection guide
```

---

## Requirements

- Ubuntu 20.04+ (or Debian-based distro)
- A user with `sudo` access
- Internet connection for package downloads

## How it works

1. Creates a shared directory (default: `/mnt/lan-share/`)
2. Installs and configures **Samba** — the industry-standard SMB protocol
3. Installs a **Node.js web file browser** with drag-and-drop upload (runs as a systemd service)
4. Creates a `README.txt` in the share directory with connection instructions

Both services start automatically on boot.

---

## Uninstall

```bash
# Stop and disable services
sudo systemctl stop lan-share-web smbd
sudo systemctl disable lan-share-web smbd

# Remove packages
sudo apt-get remove samba samba-common smbclient

# Remove web server
sudo rm /etc/systemd/system/lan-share-web.service
sudo rm -rf /home/<your-user>/lan-share

# Remove share directory (modify path if you changed it)
sudo rm -rf /mnt/lan-share
```

---

## License

MIT
