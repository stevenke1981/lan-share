#!/usr/bin/env bash
#
# LAN Share — One-command setup for a home network file server
#
# Installs:
#   - Samba (SMB)      → network drive mountable by Windows/Mac/Linux
#   - Node.js Web UI   → file browser for any device with a browser
#
# Usage:
#   bash setup.sh              # interactive (asks for confirmation)
#   bash setup.sh --yes        # non-interactive, use defaults
#   bash setup.sh --help       # show help
#
# ============================================================
set -euo pipefail
VERSION="1.1.0"

# ============================================================
# Default configuration (override via environment variables)
# ============================================================
SHARE_DIR="${SHARE_DIR:-/mnt/lan-share}"
WEB_PORT="${WEB_PORT:-8080}"
SMB_NAME="${SMB_NAME:-shared}"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_SERVER_DIR="$SCRIPT_DIR/web-server"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

print_help() {
    cat << HELP
Usage: bash setup.sh [OPTIONS]

Options:
  --yes          Non-interactive mode (skip confirmation prompts)
  --help         Show this help message and exit

Environment variables:
  SHARE_DIR     Share directory path (default: /mnt/lan-share)
  WEB_PORT      Web UI port (default: 8080)
  SMB_NAME      Samba share name (default: shared)

Examples:
  bash setup.sh
  SHARE_DIR=/data/share bash setup.sh --yes
  WEB_PORT=9090 bash setup.sh
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

# Detect Node.js
NODE_BIN=""
if command -v node &>/dev/null; then
    NODE_BIN=$(command -v node)
elif [[ -x "$HOME/.local/node/bin/node" ]]; then
    NODE_BIN="$HOME/.local/node/bin/node"
fi

# ---- Banner ----
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN} LAN Share v${VERSION} — Setup${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  Share directory : $SHARE_DIR"
echo "  SMB share name  : $SMB_NAME"
echo "  SMB network     : \\\\\\\\$HOST_IP\\\\$SMB_NAME"
echo "  Web UI          : http://$HOST_IP:$WEB_PORT"
echo ""

if ! $NON_INTERACTIVE; then
    read -r -p "Press Enter to start installation, or Ctrl+C to abort..."
fi
echo ""

# ---- 1. System dependencies ----
echo -e "${YELLOW}[1/6]${NC} Installing system dependencies ..."
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    samba samba-common smbclient curl
echo -e "  ${GREEN}✓${NC} Done"

# ---- 2. Ensure Node.js is available ----
echo -e "${YELLOW}[2/6]${NC} Checking Node.js ..."
if [[ -z "$NODE_BIN" ]]; then
    echo -e "  ${YELLOW}→${NC} Node.js not found. Installing via apt ..."
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs npm
    NODE_BIN=$(command -v node)
fi
echo -e "  ${GREEN}✓${NC} Node.js $($NODE_BIN --version) at $NODE_BIN"

# ---- 3. Create share directory ----
echo -e "${YELLOW}[3/6]${NC} Creating share directory structure ..."
sudo mkdir -p "$SHARE_DIR"/{Documents,Videos,Pictures,Music,Downloads,Projects,Backup}
sudo chmod 0777 "$SHARE_DIR"
echo -e "  ${GREEN}✓${NC} $SHARE_DIR/"

# ---- 4. Configure Samba ----
echo -e "${YELLOW}[4/6]${NC} Configuring Samba ..."
SAMBA_CONF="/etc/samba/smb.conf"

sudo cp "$SAMBA_CONF" "${SAMBA_CONF}.bak.$(date +%s)" 2>/dev/null || true

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

sudo systemctl enable smbd 2>/dev/null || true
if sudo systemctl restart smbd 2>/dev/null || sudo service smbd restart 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Samba restarted"
else
    echo -e "  ${YELLOW}⚠${NC} Could not restart smbd (may need manual restart)"
fi

# ---- 5. Install & configure Node.js web server ----
echo -e "${YELLOW}[5/6]${NC} Setting up Node.js web server ..."

# Install npm dependencies
echo -e "  ${YELLOW}→${NC} Installing npm packages ..."
cd "$WEB_SERVER_DIR"
npm install --silent 2>/dev/null
echo -e "  ${GREEN}✓${NC} Dependencies installed"

# Create systemd service
SERVICE_NAME="lan-share-web"
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=LAN Share — Web File Browser
After=network.target

[Service]
ExecStart=$NODE_BIN $WEB_SERVER_DIR/server.js --dir $SHARE_DIR
WorkingDirectory=$WEB_SERVER_DIR
Restart=on-failure
RestartSec=3
User=$USER
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ${SERVICE_NAME}.service
echo -e "  ${GREEN}✓${NC} Web server started (port $WEB_PORT)"

# ---- 6. Create README in share ----
echo -e "${YELLOW}[6/6]${NC} Creating README in share directory ..."
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
  http://$HOST_IP:$WEB_PORT
============================================
README_EOF
echo -e "  ${GREEN}✓${NC} README.txt created"

# ---- Firewall ----
if command -v ufw &>/dev/null; then
    sudo ufw allow "$WEB_PORT/tcp" 2>/dev/null || true
    sudo ufw allow samba 2>/dev/null || true
fi

# ---- Summary ----
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  📂  Share directory:  $SHARE_DIR"
echo ""
echo "  🌐  Web UI:           http://$HOST_IP:$WEB_PORT"
echo "  📂  SMB network:      \\\\\\\\$HOST_IP\\\\$SMB_NAME"
echo ""
echo "  Directory layout:"
ls -la "$SHARE_DIR" | sed 's/^/    /'
echo ""
echo -e "${GREEN}  Happy sharing!${NC}"
echo ""
