#!/usr/bin/env bash
# Web dosyalarını android/app/src/main/assets/www içine birebir kopyalar
# (vendor/wllama ve — varsa — models/ dahil). AIDE'de derlemeden önce çalıştır.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/android/app/src/main/assets/www"

rm -rf "$DEST"
mkdir -p "$DEST"

for item in index.html manifest.json sw.js assets css js vendor models; do
  if [ -e "$ROOT/$item" ]; then
    cp -R "$ROOT/$item" "$DEST/$item"
  fi
done

echo "✓ $DEST güncellendi ($(du -sh "$DEST" | cut -f1))"
