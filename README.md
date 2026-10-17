# Lotus AI

Cyberpunk / premium mor neon temalı AI sohbet uygulaması (PWA + Android WebView).

## Yapı
- `/` — Web uygulaması (vanilla JS, ES modules). Vercel'e doğrudan deploy edilir.
- `api/chat.js` — Vercel proxy (Groq anahtar rotasyonu: `GROQ_API_KEYS="k1,k2"`)
- `supabase/schema.sql` — Supabase tablo ve RLS şeması
- `android/` — AIDE / Android Studio projesi (WebView, tam ekran)

## Web
Statik sunucu ile çalışır: `python3 -m http.server 8000`
Vercel ortam değişkeni: `GROQ_API_KEYS`. Supabase URL/anon key: `js/config.js`.

## Android
`android/README-AIDE.md` dosyasına bak. `android/app/src/main/assets/www` web uygulamasının kopyasıdır; web'i güncelleyince oraya da kopyala.
`gradle-wrapper.jar` repoda yoktur: Android Studio veya `gradle wrapper --gradle-version 6.1.1` ile üretilir.

## Güvenlik
API anahtarları, `.jks` keystore ve şifreleri repoya konmaz (`.gitignore`).
