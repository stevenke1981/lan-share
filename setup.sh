#!/usr/bin/env bash
#
# LAN Share — One-command setup for a home network file server
#
# Installs:
#   - Samba (SMB)    → network drive mountable by Windows/Mac/Linux
#   - FileBrowser    → web UI for any device with a browser
#
# Usage:
#   bash setup.sh              # interactive (asks for confirmation)
#   bash setup.sh --yes        # non-interactive, use defaults
#   bash setup.sh --help       # show help
#
# ============================================================
set -euo pipefail
VERSION="1.0.0"

# ============================================================
# Default configuration (override via environment variables)
# ============================================================
SHARE_DIR="${SHARE_DIR:-/mnt/lan-share}"
FB_PORT="${FB_PORT:-8080}"
SMB_NAME="${SMB_NAME:-shared}"
AUTH_METHOD="${AUTH_METHOD:-noauth}"   # noauth | json(default)

# Colors for output
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

print_help() {
    cat << HELP
Usage: bash setup.sh [OPTIONS]

Options:
  --yes          Non-interactive mode (skip confirmation prompts)
  --help         Show this help message and exit

Environment variables:
  SHARE_DIR     Share directory path (default: /mnt/lan-share)
  FB_PORT       FileBrowser web UI port (default: 8080)
  SMB_NAME      Samba share name (default: shared)
  AUTH_METHOD   FileBrowser auth method: noauth or json (default: noauth)

Examples:
  bash setup.sh
  SHARE_DIR=/data/share bash setup.sh --yes
  AUTH_METHOD=json FB_PORT=9090 bash setup.sh
HELP
    exit 0
}

# ---- Parse arguments ----
NON_INTERACTIVE=false
for arg in "$@"; do
    case "$arg" in
        --help) print_help ;;
        --yes) NON_INTERACTIVE=true ;;
    esac
done

# ---- Pre-flight checks ----
if [[ $EUID -eq 0 ]]; then
    echo -e "${RED}Error: Do not run as root directly. Use a regular user with sudo.${NC}" >&2
    exit 1
fi

if ! command -v sudo &>/dev/null; then
    echo -e "${RED}Error: sudo is required but not found.${NC}" >&2
    exit 1
fi

# Determine host IP
HOST_IP=$(hostname -I | awk '{print $1}')
if [[ -z "$HOST_IP" ]]; then
    echo -e "${RED}Error: Could not determine host IP address.${NC}" >&2
    exit 1
fi

FB_BINARY="/usr/local/bin/filebrowser"
FB_DB="/var/lib/filebrowser/filebrowser.db"

# ---- Banner ----
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN} LAN Share v${VERSION} — Setup${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  Share directory : $SHARE_DIR"
echo "  SMB share name  : $SMB_NAME"
echo "  SMB network     : \\\\\\\\$HOST_IP\\\\$SMB_NAME"
echo "  Web UI          : http://$HOST_IP:$FB_PORT"
echo "  Auth method     : $AUTH_METHOD"
echo ""

if ! $NON_INTERACTIVE; then
    read -r -p "Press Enter to start installation, or Ctrl+C to abort..."
fi
echo ""

# ---- 1. System dependencies ----
echo -e "${YELLOW}[1/5]${NC} Installing system dependencies ..."
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    samba samba-common smbclient curl
echo -e "  ${GREEN}✓${NC} Done"

# ---- 2. Create share directory ----
echo -e "${YELLOW}[2/5]${NC} Creating share directory structure ..."
sudo mkdir -p "$SHARE_DIR"/{Documents,Videos,Pictures,Music,Downloads,Projects,Backup}
sudo chmod 0777 "$SHARE_DIR"
echo -e "  ${GREEN}✓${NC} $SHARE_DIR/"

# ---- 3. Configure Samba ----
echo -e "${YELLOW}[3/5]${NC} Configuring Samba ..."
SAMBA_CONF="/etc/samba/smb.conf"

# Backup original config
sudo cp "$SAMBA_CONF" "${SAMBA_CONF}.bak.$(date +%s)" 2>/dev/null || true

# Add share definition (idempotent)
if grep -q "^\\[${SMB_NAME}\\]" "$SAMBA_CONF" 2>/dev/null; then
    echo -e "  ${YELLOW}→${NC} [${SMB_NAME}] already exists in smb.conf, skipping."
else
    sudo tee -a "$SAMBA_CONF" > /dev/null << EOF

# ===== LAN Share (added by lan-share setup.sh) =====
[${SMB_NAME}]
   comment = LAN Shared Drive
   path = $SHARE_DIR
   browseable = yes
   read only = no
   guest ok = yes
   create mask = 0777
   directory mask = 0777
   force user = nobody
EOF
    echo -e "  ${GREEN}✓${NC} [${SMB_NAME}] added to smb.conf"
fi

# Restart Samba
sudo systemctl enable smbd 2>/dev/null || true
if sudo systemctl restart smbd 2>/dev/null || sudo service smbd restart 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Samba restarted"
else
    echo -e "  ${YELLOW}⚠${NC} Could not restart smbd (may need manual restart)"
fi

# ---- 4. Install & configure FileBrowser ----
echo -e "${YELLOW}[4/5]${NC} Installing FileBrowser ..."

# Download latest release
echo -e "  ${YELLOW}→${NC} Downloading from GitHub ..."
if curl -fsSL "https://github.com/filebrowser/filebrowser/releases/latest/download/linux-amd64-filebrowser.tar.gz" \
    -o /tmp/filebrowser.tar.gz; then
    sudo tar -C /usr/local/bin -xzf /tmp/filebrowser.tar.gz filebrowser
    sudo chmod +x "$FB_BINARY"
    rm -f /tmp/filebrowser.tar.gz
    echo -e "  ${GREEN}✓${NC} FileBrowser installed at $FB_BINARY"
else
    echo -e "  ${RED}✗${NC} Failed to download FileBrowser. Check internet connection." >&2
    exit 1
fi

# Initialize database
sudo mkdir -p /var/lib/filebrowser
sudo "$FB_BINARY" config init --database="$FB_DB" 2>/dev/null || true
sudo "$FB_BINARY" config set \
    --address="0.0.0.0" \
    --port="$FB_PORT" \
    --root="$SHARE_DIR" \
    --auth.method="$AUTH_METHOD" \
    --database="$FB_DB" \
    2>/dev/null || true

# Create systemd service
sudo tee /etc/systemd/system/filebrowser.service > /dev/null << EOF
[Unit]
Description=FileBrowser Web File Manager
After=network.target

[Service]
ExecStart=$FB_BINARY --database=$FB_DB
Restart=on-failure
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now filebrowser.service
echo -e "  ${GREEN}✓${NC} FileBrowser service started"

# ---- 5. Create README in share ----
echo -e "${YELLOW}[5/5]${NC} Creating README in share directory ..."
sudo tee "$SHARE_DIR/README.txt" > /dev/null << README_EOF
============================================
 LAN Share
============================================
 Host IP  : $HOST_IP
 Directory: $SHARE_DIR

--- Windows SMB ---
  File Explorer -> \\\\$HOST_IP\\$SMB_NAME

--- macOS SMB ---
  Finder -> Go -> Connect to Server (Cmd+K)
  Enter: smb://$HOST_IP/$SMB_NAME

--- Linux SMB ---
  File manager: smb://$HOST_IP/$SMB_NAME
  Or mount: sudo mount -t cifs //$HOST_IP/$SMB_NAME /mnt/lan_share -o guest

--- Web UI (any device with browser) ---
  http://$HOST_IP:$FB_PORT
============================================
README_EOF
echo -e "  ${GREEN}✓${NC} README.txt created"

# ---- Summary ----
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  📂  Share directory:  $SHARE_DIR"
echo ""
echo "  🌐  Web UI:           http://$HOST_IP:$FB_PORT"
echo "  📂  SMB network:      \\\\\\\\$HOST_IP\\\\$SMB_NAME"
echo ""
echo "  Directory layout:"
ls -la "$SHARE_DIR" | sed 's/^/    /'
echo ""
echo -e "${GREEN}  Happy sharing!${NC}"
echo ""
