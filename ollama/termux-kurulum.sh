#!/data/data/com.termux/files/usr/bin/sh
# Lotus Mini - telefonda yerel kurulum (Termux, Ollama).
# Termux'ı F-Droid'den kur (Play Store sürümü eski). Sonra:
#   sh termux-kurulum.sh
set -e
pkg update -y
pkg install -y ollama
export OLLAMA_ORIGINS="*"
export OLLAMA_HOST="127.0.0.1:11434"
nohup ollama serve > "$HOME/ollama.log" 2>&1 &
sleep 5
mk() {
  printf 'FROM %s\nSYSTEM """Sen Lotus Mini'"'"'sin, Lotus AI'"'"'nin yerel asistanısın. Türkçe, kısa ve net yanıt ver."""\n' "$2" > "$HOME/Modelfile.lotus"
  ollama pull "$2"
  ollama create "$1" -f "$HOME/Modelfile.lotus"
}
mk lotus-mini-low  qwen2.5:0.5b   # ~400 MB, eski/az RAM'li telefon
mk lotus-mini      qwen2.5:1.5b   # ~1 GB, çoğu telefon
echo "Hazır. Ollama'yı sonraki sefer başlatmak için:"
echo '  OLLAMA_ORIGINS="*" ollama serve &'
echo "Lotus AI'da adres: http://localhost:11434"
