#!/bin/bash
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
npx electron dist/main/index.js > /tmp/dev-launcher.log 2>&1 &
echo "Dev Launcher 已启动 (PID: $!)"
echo "日志: /tmp/dev-launcher.log"
