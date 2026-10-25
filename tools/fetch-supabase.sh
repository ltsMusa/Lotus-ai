#!/usr/bin/env bash
# ==========================================================
# Lotus AI — Supabase kütüphanesini uygulamanın içine koyar
# ==========================================================
# Kullanım:
#   tools/fetch-supabase.sh             # vendor/supabase/supabase.js dosyasını indirir
#   tools/fetch-supabase.sh --android   # sonunda android/.../assets/www kopyasını da yeniler
#
# Neden? Uygulama kütüphaneyi normalde jsDelivr CDN'den alır. CDN'e
# ulaşılamazsa (okul/iş ağı, reklam engelleyici, zayıf internet) giriş
# yapılamazdı. js/supabaseClient.js önce CDN'i, olmazsa unpkg'yi, o da
# olmazsa bu yerel kopyayı dener — yani bu dosya yedektir; olması giriş
# sorunlarını ve internetsiz açılışta gelen "sunucuya ulaşılamıyor"
# durumunu azaltır.
#
# Gerekenler: bash, npm (Termux'ta: pkg install nodejs)
# ==========================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIB_VERSION="2"        # son 2.x sürümü; CDN'deki "@2" adresiyle aynı
SYNC_ANDROID=0

for arg in "$@"; do
  case "$arg" in
    --android) SYNC_ANDROID=1 ;;
    *) echo "Bilinmeyen seçenek: $arg" >&2; exit 2 ;;
  esac
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ @supabase/supabase-js@${LIB_VERSION} indiriliyor..."
( cd "$TMP" && npm pack "@supabase/supabase-js@${LIB_VERSION}" --silent >/dev/null && tar -xzf ./*.tgz )

SRC="$TMP/package/dist/umd/supabase.js"
[ -f "$SRC" ] || { echo "UMD dosyası bulunamadı: $SRC" >&2; exit 1; }

mkdir -p "$ROOT/vendor/supabase"
cp "$SRC" "$ROOT/vendor/supabase/supabase.js"
echo "✓ vendor/supabase/supabase.js ($(wc -c < "$ROOT/vendor/supabase/supabase.js") bayt)"

if [ "$SYNC_ANDROID" = 1 ]; then
  bash "$ROOT/tools/sync-android.sh"
fi
