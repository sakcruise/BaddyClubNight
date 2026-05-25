#!/bin/bash
# Raspberry Pi 4 setup script for Badminton Club Night kiosk
set -e

echo "🏸 Setting up Badminton Club Night on Raspberry Pi..."

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Chromium for kiosk mode
sudo apt-get install -y chromium-browser

# Install unclutter (hide mouse cursor in kiosk)
sudo apt-get install -y unclutter

# Clone / copy app (adjust path as needed)
APP_DIR="$HOME/badminton-club-night"

# Install dependencies
cd "$APP_DIR/server" && npm install
cd "$APP_DIR/client" && npm install && npm run build

# Create data directory
mkdir -p "$APP_DIR/data"

# Copy systemd service
sudo cp "$APP_DIR/scripts/badminton.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable badminton
sudo systemctl start badminton

echo "✅ Server installed and running as a systemd service."
echo "   Run ./start-kiosk.sh to launch the kiosk display."
