# Lotus AI · 7.0

Mor-neon cam (glassmorphism) temalı yapay zekâ sohbet uygulaması — PWA + Android WebView paketi.

## Neler var
- Akışlı (streaming) sohbet, durdur / yeniden oluştur / mesajı düzenle, markdown + kod blokları
- **Otomatik yönlendirme**: bağlı sağlayıcı varsa ona gider → kotası dolunca/hata verince sıradaki sağlayıcıya geçer → hiçbiri yoksa ya da internet kesikse cihazdaki **Lotus Mini** yanıtlar (ayrıntı aşağıda)
- **Lotus Mini (cihazda)**: Qwen2.5 tabanlı küçük model, uygulamanın içinde WebAssembly ile çalışır — sunucu, Ollama ya da Termux gerekmez. Isınmaya/pile/RAM'e göre model boyutunu kendisi seçer
- Ollama (isteğe bağlı): kendi sunucuna bağlanmak istersen `ollama/termux-kurulum.sh`
- Web araması (Tavily / Jina / anahtarsız yedekler), sayfa özetleme/çeviri araçları
- Görsel oluşturma (Pollinations, anahtarsız) + galeri, görsel/dosya analizi
- **Kişiselleştirme** (Ayarlar → Kişiselleştirme): hitap şekli, kendin hakkında kısa not, cevap uzunluğu / üslup / dil ve özel talimatlar — her sohbette Lotus'a ek talimat olarak gider, canlı önizlemesi vardır, kapatılabilir ve sıfırlanabilir. Hafıza'dan ayrıdır
- Hafıza: "hatırla: …", "unut: …", "neler hatırlıyorsun?" — misafirde cihazda, girişli kullanıcıda Supabase'de
- Supabase hesap sistemi (isteğe bağlı), giriş yapılmazsa her şey localStorage'da
- Çevrimdışı açılan, güncelleme bildirimi veren PWA (service worker)

## Yerel yapay zekâ ve otomatik geçiş

**Yönlendirme** (`js/router.js`, `js/api.js`) — Ayarlar → Yapay Zekâ → "Otomatik yönlendirme":
- *Otomatik (varsayılan)*: sağlayıcılar sırayla denenir. Kota dolan ya da hata veren sağlayıcı bir süre dinlendirilir
  (limit: 2 → 6 → 18 → 54 dk; ortak anahtar havuzu bitince 30 dk; yanlış anahtar 60 dk). Sağlayıcıların hepsi
  kullanılamıyorsa, hiç sağlayıcı bağlı değilse ya da internet yoksa cihazdaki Lotus Mini yanıtlar.
  Bir anahtar kaydedilince ya da internet gelince bir sonraki mesaj kendiliğinden buluta döner.
- *Yalnızca bulut* / *Yalnızca cihazda*: elle sabitleme (cihazda modunda hiçbir şey cihazdan çıkmaz).
- Geçişler küçük bir bildirimle söylenir; yerel cevaplarda "Cihazda yanıtlandı" rozeti görünür.
- Yerel model yoksa ve gerekirse, "limit doldu" kartından Lotus Mini sohbetin içinde indirilir.

**Cihaza göre model seçimi** (`js/localPolicy.js`, `js/deviceMonitor.js`):
- Modeller: *Lotus Mini Hafif* (Qwen2.5-0.5B, ~469 MB) ve *Lotus Mini Güçlü* (Qwen2.5-1.5B, ~1,04 GB), Q4_K_M.
- RAM ve çekirdek sayısı büyük modele yetiyorsa ve cihaz serinse Güçlü; ısınınca (Android ısı durumu / pil sıcaklığı /
  Compute Pressure API / ölçülen hız düşüşü), pil %15'in altına inince ya da güç tasarrufu açılınca Hafif'e ve daha az
  iş parçacığına geçer; soğuyunca geri döner. "Isınmaya göre değiştir" Ayarlar'dan kapatılabilir.
- **Doğruluk notu**: gerçek ısı bilgisi yalnızca Android uygulamasında (`LotusNative`) okunur. Tarayıcıda ısı,
  yavaşlama ölçülerek *tahmin edilir* — yani cihaz yavaşlamaya başladıktan sonra tepki verir.

**Motor ve model dosyaları**
- Motor: [wllama](https://github.com/ngxson/wllama) 3.8.1 (MIT, llama.cpp'nin WebAssembly derlemesi).
  `tools/fetch-local-ai.sh` motoru `vendor/wllama/` içine koyar (internetsiz açılır). Koymazsan ilk kullanımda jsDelivr'den gelir.
- Model dosyaları depoya konmaz (GitHub 100 MB sınırı). Uygulama içinden indirilir ya da
  `tools/fetch-local-ai.sh --with-model` ile `models/` içine konup APK'ya gömülür.
- Çoklu iş parçacığı yalnızca sayfa "cross-origin isolated" ise çalışır; Android uygulaması bunun için gerekli başlıkları kendisi verir.
  Web'de (Vercel) tek iş parçacığıyla çalışır.
- Telefonda yerel model yaklaşık 0,5–1,7 GB RAM kullanır; küçük modelin Türkçesi ve akıl yürütmesi bulut sağlayıcılardan zayıftır.

## Yapı
- `/` — Web uygulaması (vanilla JS, ES modules, derleme adımı yok). Vercel'e doğrudan deploy edilir.
- `api/chat.js`, `api/search.js` — Vercel sunucusuz proxy'ler (anahtarlar tarayıcıya inmez)
- `supabase/schema.sql` — tablo ve RLS şeması
- `android/` — AIDE / Android Studio projesi (tam ekran WebView)
- `js/router.js`, `js/localPolicy.js`, `js/deviceMonitor.js`, `js/providers/local.js`, `js/autoSwitch.js`, `js/settingsLocal.js` — yönlendirme ve yerel yapay zekâ
- `vendor/wllama/`, `models/` — yerel motor ve (isteğe bağlı) model dosyaları, `tools/fetch-local-ai.sh` ile gelir
- `tools/` — `fetch-local-ai.sh` (motor/model), `sync-android.sh` (web dosyalarını Android kopyasına yansıtır)
- `js/prompts/systemPrompt.js` — Lotus'un kişiliği (tek yerde); `js/personalization.js` — Kişiselleştirme ayarları
- `tests/` — birim testleri: `node --test tests/local-ai.test.mjs tests/personalization.test.mjs`
- `lotus-model/` — küçük deneysel model eğitim betikleri (uygulama kullanmaz)
- `ollama/termux-kurulum.sh` — (isteğe bağlı) telefonda Termux ile Ollama kurulumu; sistem promptu `node tools/export-system-prompt.mjs` ile `systemPrompt.js`'den kopyalanır

## Web
Statik sunucu: `python3 -m http.server 8000` → http://localhost:8000
(`file://` ile açılmaz: ES modülleri tarayıcıda dosya yolundan yüklenemez.)

Birim testleri: `node --test tests/local-ai.test.mjs`

## Vercel ortam değişkenleri
| Değişken | Ne işe yarar |
|---|---|
| `GROQ_API_KEY` ya da `GROQ_API_KEYS="k1,k2"` | Ortak Groq anahtarı (çoklu = limit dolunca otomatik döner) |
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | İsteğe bağlı yedek sağlayıcılar |
| `GROQ_MODEL` | Varsayılan Groq modelini değiştirir (şu an `openai/gpt-oss-120b`) |
| `GROQ_VISION_MODEL` | Görsel analiz modeli (şu an `qwen/qwen3.8-27b`) |
| `EXTRA_ALLOWED_MODELS` | Sunucunun kabul edeceği ek model adları, virgülle |
| `TAVILY_API_KEY`, `JINA_API_KEY`, `BRAVE_API_KEY` (hepsi `…_KEYS="a,b"` ile çoğul olabilir) | `api/search.js` için isteğe bağlı web arama anahtarları; hiçbiri yoksa anahtarsız yedekler denenir |

Model adları sağlayıcılarda zamanla kapanır; bir model "bulunamadı" derse
Ayarlar → Yapay Zekâ'dan model adını değiştirmek yeterlidir.
(Groq `llama-3.3-70b-versatile` modelini ücretsiz/geliştirici hesaplar için 16 Ağustos 2026'da kapattı.)

## Android
`android/README-AIDE.md` dosyasına bak. `android/app/src/main/assets/www`, web uygulamasının kopyasıdır;
web'i güncelleyince `tools/sync-android.sh` ile yenile (ya da elle: `assets css js vendor models index.html manifest.json sw.js`).

Uygulama APK içinden, `https://appassets.androidplatform.net/www/index.html` adlı özel bir adresle sunulur
(`MainActivity.shouldInterceptRequest`); `file://` kullanılmaz çünkü Chromium ES modüllerini oradan yüklemez.
Paketlenmiş uygulamada sunucu yoktur: Ayarlar → Yapay Zekâ'dan **Sunucu Proxy Adresi**ni (Vercel adresin)
ya da kendi API anahtarını gir. Google ile giriş paketlenmiş uygulamada desteklenmez.

`gradle-wrapper.jar` repoda yoktur: Android Studio veya `gradle wrapper --gradle-version 6.1.1` ile üretilir.

## Güvenlik
API anahtarları, `.jks` keystore ve şifreleri repoya konmaz (`.gitignore`).
Tarayıcıya girilen kişisel anahtarlar yalnızca o cihazın localStorage'ında durur.
