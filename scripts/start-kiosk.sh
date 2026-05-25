#!/bin/bash
# Launch Chromium in kiosk mode for 21" touchscreen

# Disable screen blanking
xset s off
xset -dpms
xset s noblank

# Hide mouse cursor after 0.1s inactivity
unclutter -idle 0.1 -root &

# Launch Chromium fullscreen in kiosk mode
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-translate \
  --no-first-run \
  --disable-features=TranslateUI \
  --touch-events=enabled \
  --enable-touch-drag-drop \
  --start-fullscreen \
  "http://localhost:5173/kiosk"
