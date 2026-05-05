#!/bin/bash
# Install and setup Caddy for PAW external proxy with Let's Encrypt

set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Setting up Caddy for paw.oxs.at ===${NC}"

# 1. Install Caddy if not present
if ! command -v caddy &> /dev/null; then
  echo -e "${BLUE}Installing Caddy from official release...${NC}"
  CADDY_VERSION=$(curl -s https://api.github.com/repos/caddyserver/caddy/releases/latest | grep tag_name | cut -d'"' -f4 | sed 's/v//')
  CADDY_URL="https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz"
  
  mkdir -p /tmp/caddy-install
  cd /tmp/caddy-install
  curl -L -o caddy.tar.gz "$CADDY_URL"
  tar -xzf caddy.tar.gz
  mv caddy /usr/bin/caddy
  chmod +x /usr/bin/caddy
  cd -
  rm -rf /tmp/caddy-install
  
  echo -e "${GREEN}Caddy installed: $(caddy version)${NC}"
else
  echo -e "${GREEN}Caddy already installed: $(caddy version)${NC}"
fi

# 2. Create caddy user if not present
if ! id caddy &>/dev/null; then
  echo -e "${BLUE}Creating caddy system user...${NC}"
  useradd -r -s /sbin/nologin -d /var/lib/caddy caddy
else
  echo -e "${GREEN}Caddy user already exists${NC}"
fi

# 3. Create directories
echo -e "${BLUE}Creating Caddy directories...${NC}"
mkdir -p /etc/caddy /var/lib/caddy /var/log/caddy
chown -R caddy:caddy /var/lib/caddy /var/log/caddy
chmod 755 /etc/caddy

# 4. Copy Caddyfile
REPO_DIR="${1:-/git/pawvax}"
if [[ ! -f "$REPO_DIR/Caddyfile" ]]; then
  echo "Error: Caddyfile not found at $REPO_DIR/Caddyfile"
  exit 1
fi

echo -e "${BLUE}Installing Caddyfile...${NC}"
cp "$REPO_DIR/Caddyfile" /etc/caddy/Caddyfile
chown caddy:caddy /etc/caddy/Caddyfile
chmod 644 /etc/caddy/Caddyfile

# 5. Test Caddyfile syntax
echo -e "${BLUE}Validating Caddyfile syntax...${NC}"
caddy validate --config /etc/caddy/Caddyfile

# 6. Install systemd service
echo -e "${BLUE}Installing systemd service...${NC}"
cp "$REPO_DIR/podman/caddy.service" /etc/systemd/system/caddy.service
systemctl daemon-reload

# 7. Start Caddy
echo -e "${BLUE}Starting Caddy service...${NC}"
systemctl enable caddy.service
systemctl start caddy.service

# 8. Check status
sleep 2
if systemctl is-active --quiet caddy.service; then
  echo -e "${GREEN}✓ Caddy is running${NC}"
  systemctl status caddy.service --no-pager
else
  echo "Error: Caddy failed to start"
  journalctl -u caddy.service -n 20 --no-pager
  exit 1
fi

echo -e "${GREEN}=== Caddy setup complete ===${NC}"
echo ""
echo "Caddy is now running and will:"
echo "  • Listen on paw.oxs.at (ports 80/443)"
echo "  • Automatically provision Let's Encrypt certificate"
echo "  • Reverse proxy to PAW pod on localhost:80"
echo ""
echo "Monitor logs with:"
echo "  journalctl -u caddy.service -f"
echo ""
echo "If DNS hasn't propagated yet, Caddy will retry Let's Encrypt validation."
