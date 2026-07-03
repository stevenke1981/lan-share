# Connection Guide — LAN Share

Detailed, step-by-step instructions for connecting to your LAN Share server from any device.

Replace `<IP>` with your server's IP address (displayed at the end of `setup.sh`).

---

## Windows (SMB)

### File Explorer (Windows 10/11)
1. Open **File Explorer** (`Win + E`)
2. Click the address bar
3. Type: `\\<IP>\shared`
4. Press **Enter**
5. The shared folder will appear in the sidebar under **Network**

### Map as a network drive
1. Open **File Explorer**
2. Right-click **This PC** → **Map network drive**
3. Choose a drive letter (e.g., `Z:`)
4. Folder: `\\<IP>\shared`
5. Check **Reconnect at sign-in**
6. Click **Finish**

---

## macOS (SMB)

### Finder
1. Open **Finder**
2. Click **Go** → **Connect to Server** (or press `Cmd + K`)
3. Server Address: `smb://<IP>/shared`
4. Click **Connect**
5. The share will appear under **Locations** in Finder sidebar

### Auto-mount on login
1. Open **System Settings** → **General** → **Login Items**
2. Click **+** and add the mounted volume

---

## Linux (SMB)

### File Manager (GNOME Files / Nautilus)
1. Open **Files**
2. Click **Other Locations** in the sidebar
3. In **Connect to Server**, enter: `smb://<IP>/shared`
4. Click **Connect**

### Mount via command line
```bash
# Create mount point
sudo mkdir -p /mnt/lan_share

# Mount (guest access)
sudo mount -t cifs //<IP>/shared /mnt/lan_share -o guest

# Mount with credentials (if auth enabled)
sudo mount -t cifs //<IP>/shared /mnt/lan_share -o username=admin

# Auto-mount on boot (add to /etc/fstab)
# //<IP>/shared  /mnt/lan_share  cifs  guest,uid=1000,gid=1000,noauto  0  0
```

### Install CIFS utilities (if mount fails)
```bash
sudo apt-get install cifs-utils
```

---

## Any device with a browser (Web UI)

No setup required. Just open your browser and go to:

```
http://<IP>:8080
```

### Features
- 📂 Browse files and folders
- ⬆️ Upload files (drag & drop)
- ⬇️ Download files
- 🖼️ Preview images, videos, PDFs, audio, text
- 🔍 Search files across all folders
- 🗑️ Delete and create folders
- 🚫 No login required (home LAN use)

---

## Android

### Via browser (no app needed)
1. Open Chrome / any browser
2. Go to `http://<IP>:8080`

### Via SMB (file manager app)
1. Install **CX File Explorer** or **Solid Explorer** from Play Store
2. Open the app → **Network** → **SMB / Windows Share**
3. Tap **Add Server**
4. Host: `<IP>`, Share: `shared`
5. Connect

---

## iOS / iPadOS

### Via browser (no app needed)
1. Open Safari
2. Go to `http://<IP>:8080`

### Via SMB (Files app)
1. Open the **Files** app
2. Tap **⋯** (more) → **Connect to Server**
3. Server: `smb://<IP>/shared`
4. Tap **Connect**

---

## Troubleshooting

| Problem | Likely fix |
|---------|-----------|
| Can't find the server | Make sure all devices are on the **same Wi-Fi / LAN** |
| SMB connection refused | Check firewall: `sudo ufw allow samba` |
| Web UI not loading | Check service: `sudo systemctl status lan-share-web` |
| Permission denied | Run `sudo chmod -R 0777 /mnt/lan-share` |
| "mount error(2): No such file or directory" | Install cifs-utils: `sudo apt-get install cifs-utils` |
| Windows requires network credentials | Enable guest access in Windows: `secpol.msc` → Network access: Let Everyone permissions apply to anonymous users |
