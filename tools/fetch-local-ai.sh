#!/usr/bin/env bash
# ==========================================================
# Lotus AI — yerel yapay zekâ dosyalarını uygulamaya ekler
# ==========================================================
# Kullanım:
#   tools/fetch-local-ai.sh                    # motoru (wllama) vendor/wllama/ içine indirir
#   tools/fetch-local-ai.sh --with-model       # + Lotus Mini Hafif modelini models/ içine koyar (~470 MB)
#   tools/fetch-local-ai.sh --with-model=mini-1.5b   # + Güçlü model (~1.1 GB)
#   tools/fetch-local-ai.sh --android          # sonunda android/.../assets/www kopyasını da yeniler
#
# Gerekenler: bash, curl, tar ve (motor için) npm. Termux'ta:
#   pkg install nodejs curl tar
#
# Motor olmadan da uygulama çalışır: ilk kullanımda motor jsDelivr CDN'den
# gelir (internet gerekir). Bu betik motoru uygulamanın içine koyar, böylece
# internetsiz de açılır. Modeli içine koymazsan ilk seferde Ayarlar → Yapay
# Zekâ'dan (ya da limit kartından) cihaza indirilir.
# ==========================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE_VERSION="3.8.1"
WITH_MODEL=""
SYNC_ANDROID=0

for arg in "$@"; do
  case "$arg" in
    --with-model) WITH_MODEL="mini-0.5b" ;;
    --with-model=*) WITH_MODEL="${arg#--with-model=}" ;;
    --android) SYNC_ANDROID=1 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Bilinmeyen seçenek: $arg" >&2; exit 2 ;;
  esac
done

# ---------- 1) motor ----------
if command -v npm >/dev/null 2>&1; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  echo "→ @wllama/wllama@${ENGINE_VERSION} indiriliyor…"
  (cd "$TMP" && npm pack "@wllama/wllama@${ENGINE_VERSION}" --silent >/dev/null && tar xzf ./*.tgz)

  if [ ! -f "$TMP/package/esm/index.js" ]; then
    echo "HATA: pakette esm/index.js yok — paket düzeni değişmiş olabilir." >&2
    exit 1
  fi

  WASM="$(find "$TMP/package" -name 'wllama.wasm' -not -path '*compat*' | head -n 1)"
  if [ -z "$WASM" ]; then
    echo "HATA: pakette wllama.wasm bulunamadı." >&2
    exit 1
  fi

  rm -rf "$ROOT/vendor/wllama"
  mkdir -p "$ROOT/vendor/wllama"
  cp -R "$TMP/package/esm/." "$ROOT/vendor/wllama/"
  cp "$WASM" "$ROOT/vendor/wllama/wllama.wasm"
  cp "$TMP/package/LICENCE" "$ROOT/vendor/wllama/LICENSE.txt" 2>/dev/null || true
  echo "✓ motor: vendor/wllama/ ($(du -sh "$ROOT/vendor/wllama" | cut -f1))"
else
  echo "! npm bulunamadı — motor atlandı (uygulama ilk kullanımda CDN'den alır)." >&2
fi

# ---------- 2) model (isteğe bağlı) ----------
if [ -n "$WITH_MODEL" ]; then
  case "$WITH_MODEL" in
    mini-0.5b)
      FILE="qwen2.5-0.5b-instruct-q4_k_m.gguf"
      URL="https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/$FILE"
      SIZE=491400032 ;;
    mini-1.5b)
      FILE="qwen2.5-1.5b-instruct-q4_k_m.gguf"
      URL="https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/$FILE"
      SIZE=1117320736 ;;
    *) echo "Bilinmeyen model: $WITH_MODEL (mini-0.5b | mini-1.5b)" >&2; exit 2 ;;
  esac

  mkdir -p "$ROOT/models"
  echo "→ $FILE indiriliyor…"
  curl -fL --retry 3 -C - -o "$ROOT/models/$FILE" "$URL"

  GOT="$(wc -c < "$ROOT/models/$FILE" | tr -d ' ')"
  if [ "$GOT" != "$SIZE" ]; then
    echo "HATA: boyut beklenenden farklı ($GOT ≠ $SIZE). Dosya silindi, tekrar dene." >&2
    rm -f "$ROOT/models/$FILE"
    exit 1
  fi
  echo "✓ model: models/$FILE"
  echo "  Not: GitHub tek dosyada 100 MB sınırı koyar — models/ klasörünü commit'leme (.gitignore'da)."
fi

# ---------- 3) Android kopyası ----------
if [ "$SYNC_ANDROID" = 1 ]; then
  "$ROOT/tools/sync-android.sh"
fi

echo "Bitti."
