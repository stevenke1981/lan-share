#!/usr/bin/env bash
# Switch from FileBrowser to Node.js Web File Browser
set -euo pipefail

SHARE_DIR="${SHARE_DIR:-/mnt/hdd4t/shared}"
WEB_DIR="/home/steven/lan-share/web-server"
NODE_BIN=$(which node 2>/dev/null || echo "/home/steven/.local/node/bin/node")

echo "============================================="
echo " Migrate: FileBrowser → Node.js Web Server"
echo "============================================="
echo ""

read -r -p "Press Enter to start migration, or Ctrl+C to abort..."
echo ""

# 1. Stop & disable FileBrowser
echo "[1/4] Stopping FileBrowser ..."
sudo systemctl stop filebrowser 2>/dev/null || true
sudo systemctl disable filebrowser 2>/dev/null || true
echo "  ✓ FileBrowser stopped"

# 2. Create systemd service for Node.js server
echo "[2/4] Creating systemd service for Node.js web server ..."
sudo tee /etc/systemd/system/lan-share-web.service > /dev/null << EOF
[Unit]
Description=LAN Share — Web File Browser
After=network.target

[Service]
ExecStart=$NODE_BIN $WEB_DIR/server.js --dir $SHARE_DIR
WorkingDirectory=$WEB_DIR
Restart=on-failure
RestartSec=3
User=steven
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
echo "  ✓ Service created"

# 3. Start the new service
echo "[3/4] Starting LAN Share Web service ..."
sudo systemctl enable --now lan-share-web.service
echo "  ✓ Service started"

# 4. Update firewall if needed
echo "[4/4] Checking firewall ..."
if command -v ufw &>/dev/null; then
  sudo ufw allow 8080/tcp 2>/dev/null || true
  echo "  ✓ Firewall rule added (port 8080)"
fi

echo ""
echo "============================================="
echo " Migration complete!"
echo "============================================="
echo ""
echo " Web UI: http://$(hostname -I | awk '{print $1}'):8080"
echo " (no login required)"
echo ""
echo " To check status: sudo systemctl status lan-share-web"
echo " To view logs:    sudo journalctl -u lan-share-web -f"
echo ""

# Show status
sudo systemctl status lan-share-web --no-pager -l 2>&1 | head -12
