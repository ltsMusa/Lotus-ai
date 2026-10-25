<div align="center">

<img src="assets/icons/icon-512.png" alt="Lotus AI" width="168">

# 🌸 Lotus AI

### Yapay zekânın geleceğine açılan kapı.

![Sürüm](https://img.shields.io/badge/s%C3%BCr%C3%BCm-7.0-a855f7?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-%C3%A7evrimd%C4%B1%C5%9F%C4%B1%20a%C3%A7%C4%B1l%C4%B1r-c084fc?style=flat-square)
![Android](https://img.shields.io/badge/Android-WebView-7c3aed?style=flat-square)
![Yerel AI](https://img.shields.io/badge/Lotus%20Mini-cihazda%20%C3%A7al%C4%B1%C5%9F%C4%B1r-d946ef?style=flat-square)
![Derleme](https://img.shields.io/badge/derleme%20ad%C4%B1m%C4%B1-yok-6d28d9?style=flat-square)

[Neler var](#-neler-var) · [Lotus Mini](#-lotus-mini-ve-otomatik-geçiş) · [Kişiselleştirme](#-kişiselleştirme-ve-hafıza) · [Kurulum](#-kurulum) · [Yapı](#-proje-yapısı)

</div>

---

Lotus AI, daha kişisel, akıllı ve erişilebilir bir yapay zekâ deneyimi oluşturmak için geliştirilen bir AI projesidir. Amacımız yalnızca soruları yanıtlayan bir chatbot değil, zamanla gelişen ve kullanıcıyla birlikte büyüyen bir yapay zekâ ekosistemi oluşturmak.

Mor-neon cam (glassmorphism) temalı, akıcı bir sohbet arayüzü; telefonda **PWA** ya da **Android uygulaması** olarak çalışır.

## 🚀 Gelecek Planlarımız

- 🧠 Daha gelişmiş hafıza ve kişiselleştirme
- ⚡ Otomatik sağlayıcı yönetimi ve akıllı yedekleme
- 🔌 Birden fazla yapay zekâ sağlayıcısına destek
- 🌐 Lotus ekosistemiyle entegrasyon
- 💻 Gelecekte Lotus OS ve diğer Lotus uygulamalarıyla bağlantı

> Bu sadece başlangıç. Gelecek, Lotus ile yeniden şekilleniyor. 🌸

Yol haritasının bir kısmı **bugün zaten çalışıyor**: otomatik sağlayıcı geçişi, çoklu sağlayıcı desteği, hafıza ve kişiselleştirme aşağıda.

---

## ✨ Neler var

| | |
|---|---|
| 💬 **Sohbet** | Akışlı (streaming) cevaplar, durdur / yeniden oluştur / mesajı düzenle, markdown ve kod blokları |
| 🔌 **Çoklu sağlayıcı** | Groq · OpenRouter · Gemini · OpenAI (+ isteğe bağlı kendi Ollama sunucun) |
| ⚡ **Otomatik yönlendirme** | Kotası dolan sağlayıcıdan sıradakine geçer; hiçbiri yoksa ya da internet kesikse cihazdaki Lotus Mini yanıtlar |
| 📱 **Lotus Mini** | Uygulamanın içinde çalışan yerel model — sunucu, Ollama ya da Termux gerekmez |
| 🎨 **Kişiselleştirme** | **Tema** (Lotus Mor ya da Karanlık siyah-gri), hitap, üslup, cevap uzunluğu, dil ve özel talimatlar; canlı önizleme |
| 🧠 **Hafıza** | `hatırla: …`, `unut: …`, `neler hatırlıyorsun?` |
| 🌐 **Web araması** | Tavily / Jina / anahtarsız yedekler; sayfa özetleme ve çeviri araçları |
| 🖼️ **Görseller** | Görsel oluşturma (Pollinations, anahtarsız) + galeri, görsel ve dosya analizi |
| 👤 **Hesap** | Supabase ile isteğe bağlı giriş; girişsiz her şey cihazda (localStorage) kalır |
| 📴 **PWA** | Çevrimdışı açılır, güncelleme olunca tek dokunuşla yenilenir |

---

## 🌸 Lotus Mini ve otomatik geçiş

**Lotus Mini**, uygulamanın içinde WebAssembly ile çalışan, Qwen2.5 tabanlı açık kaynak bir modeldir (sıfırdan eğitilmemiştir). İnternet yokken ya da hiçbir sağlayıcı kullanılamazken devreye girer.

**Yönlendirme** (Ayarlar → Yapay Zekâ → *Otomatik yönlendirme*):

```text
bağlı sağlayıcı ─► kota dolunca / hata verince ─► sıradaki sağlayıcı ─► hiçbiri yoksa / internet yoksa ─► 📱 Lotus Mini
```

- **Otomatik** (varsayılan) · **Yalnızca bulut** · **Yalnızca cihazda** (bu modda hiçbir şey cihazdan çıkmaz)
- Geçişler küçük bir bildirimle söylenir; yerel cevaplarda *"Cihazda yanıtlandı"* rozeti görünür.
- Bir anahtar kaydedilince ya da internet gelince bir sonraki mesaj kendiliğinden buluta döner.

**Cihaza göre model seçimi**

| Model | Boyut | Ne zaman |
|---|---|---|
| Lotus Mini **Hafif** (Qwen2.5-0.5B, Q4_K_M) | ~469 MB | Cihaz ısındığında, pil %15'in altına inince, güç tasarrufunda, az RAM'de |
| Lotus Mini **Güçlü** (Qwen2.5-1.5B, Q4_K_M) | ~1,04 GB | RAM ve çekirdek yetiyorsa ve cihaz serinse |

Soğuyunca Güçlü'ye geri döner. "Isınmaya göre değiştir" Ayarlar'dan kapatılabilir.

<details>
<summary><b>Dürüst notlar ve teknik ayrıntılar</b></summary>

- Gerçek ısı bilgisi yalnızca **Android uygulamasında** okunur (`LotusNative`). Tarayıcıda ısı, yavaşlama ölçülerek *tahmin edilir*; yani cihaz yavaşlamaya başladıktan sonra tepki verilir.
- Telefonda yerel model yaklaşık 0,5–1,7 GB RAM kullanır. Küçük modelin Türkçesi ve akıl yürütmesi bulut sağlayıcılardan zayıftır.
- Motor: [wllama](https://github.com/ngxson/wllama) 3.8.1 (MIT, llama.cpp'nin WebAssembly derlemesi). `tools/fetch-local-ai.sh` motoru `vendor/wllama/` içine koyar (internetsiz açılır); koymazsan ilk kullanımda jsDelivr / unpkg'den gelir.
- Model dosyaları depoya konmaz (GitHub 100 MB sınırı). Uygulama içinden indirilir ya da `tools/fetch-local-ai.sh --with-model` ile `models/` içine konup APK'ya gömülür.
- Çoklu iş parçacığı yalnızca sayfa "cross-origin isolated" ise çalışır; Android uygulaması gerekli başlıkları kendisi verir. Web'de (Vercel) tek iş parçacığıyla çalışır.
- Cooldown süreleri: limit dolunca 2 → 6 → 18 → 54 dk; ortak anahtar havuzu bitince 30 dk; yanlış anahtar 60 dk.

</details>

---

## 🎨 Kişiselleştirme ve Hafıza

İkisi ayrı şeylerdir:

- **Kişiselleştirme** (Ayarlar → Kişiselleştirme) — önce **tema** seçersin: *Lotus Mor* (pembe-mor neon, varsayılan) ya da *Karanlık* (siyah ve gri); seçim bu cihazda hatırlanır. Sonra Lotus'a söylediklerin — senin koyduğun kalıcı tercihler: nasıl hitap edileceğin, kendin hakkında kısa not, cevap uzunluğu, üslup, dil ve özel talimatlar. Her sohbette Lotus'a ek talimat olarak gider; neyin gönderildiğini canlı önizlemeden görürsün, istediğin an kapatır ya da sıfırlarsın.
- **Hafıza** — Lotus'un senden öğrendiği kısa bilgiler. Misafirken cihazda, giriş yapınca Supabase'de tutulur.

Lotus'un kişiliği tek bir dosyada yaşar: [`js/prompts/systemPrompt.js`](js/prompts/systemPrompt.js). Bütün sağlayıcılar, Lotus Mini ve Ollama kurulumu aynı metinden beslenir.

---

## 🔧 Kurulum

### Web

Derleme adımı yok (vanilla JS + ES modules). Statik bir sunucu yeter:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

> `file://` ile açılmaz: ES modülleri tarayıcıda dosya yolundan yüklenemez.

### Vercel

Depoyu Vercel'e olduğu gibi deploy edebilirsin. `api/chat.js` ve `api/search.js` sunucusuz proxy'lerdir; anahtarlar tarayıcıya inmez.

<details>
<summary><b>Ortam değişkenleri</b></summary>

| Değişken | Ne işe yarar |
|---|---|
| `GROQ_API_KEY` ya da `GROQ_API_KEYS="k1,k2"` | Ortak Groq anahtarı (çoklu = limit dolunca otomatik döner) |
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | İsteğe bağlı yedek sağlayıcılar |
| `GROQ_MODEL` | Varsayılan Groq modelini değiştirir (şu an `openai/gpt-oss-120b`) |
| `GROQ_VISION_MODEL` | Görsel analiz modeli (şu an `qwen/qwen3.8-27b`) |
| `EXTRA_ALLOWED_MODELS` | Sunucunun kabul edeceği ek model adları, virgülle |
| `TAVILY_API_KEY`, `JINA_API_KEY`, `BRAVE_API_KEY` (hepsi `…_KEYS="a,b"` ile çoğul olabilir) | `api/search.js` için isteğe bağlı web arama anahtarları; hiçbiri yoksa anahtarsız yedekler denenir |

Model adları sağlayıcılarda zamanla kapanır; bir model "bulunamadı" derse Ayarlar → Yapay Zekâ'dan model adını değiştirmek yeterlidir.

</details>

### Android

Ayrıntılar için [`android/README-AIDE.md`](android/README-AIDE.md). Kısaca:

- Proje AIDE / Android Studio ile açılır; tam ekran bir WebView'dir.
- `android/app/src/main/assets/www`, web uygulamasının kopyasıdır. Web'i güncelleyince `tools/sync-android.sh` ile yenile.
- Uygulama APK içinden `https://appassets.androidplatform.net/www/index.html` adresiyle sunulur (`file://` kullanılmaz; Chromium ES modüllerini oradan yüklemez).
- Paketlenmiş uygulamada sunucu yoktur: Ayarlar → Yapay Zekâ'dan **Sunucu Proxy Adresi**ni (Vercel adresin) ya da kendi API anahtarını gir. Google ile giriş paketlenmiş uygulamada desteklenmez.
- `gradle-wrapper.jar` repoda yoktur: Android Studio veya `gradle wrapper --gradle-version 6.1.1` ile üretilir.

### Ollama (isteğe bağlı)

Kendi sunucunda ya da telefonda Termux ile çalıştırmak istersen: [`ollama/termux-kurulum.sh`](ollama/termux-kurulum.sh).

---

## 📂 Proje yapısı

```text
index.html, css/, js/, assets/    Web uygulaması (vanilla JS, ES modules)
├─ js/prompts/systemPrompt.js     Lotus'un kişiliği (tek yerde)
├─ js/personalization.js          Kişiselleştirme ayarları
├─ js/themeList.js, themes.js     Temalar (renkler css/themes.css içinde)
├─ js/router.js, localPolicy.js,
│  deviceMonitor.js, autoSwitch.js Yönlendirme ve cihaza göre model seçimi
└─ js/providers/                  groq · openrouter · gemini · openai · ollama · local (Lotus Mini)
api/                              Vercel sunucusuz proxy'ler (chat, search)
supabase/schema.sql               Tablo ve RLS şeması
android/                          AIDE / Android Studio projesi
vendor/wllama/, models/           Yerel motor ve (isteğe bağlı) model dosyaları
tools/                            fetch-local-ai.sh · sync-android.sh · export-system-prompt.mjs
tests/                            Birim testleri
ollama/                           Termux + Ollama kurulumu
lotus-model/                      Küçük deneysel model eğitim betikleri (uygulama kullanmaz)
```

---

## 🧪 Testler

```bash
node --test tests/local-ai.test.mjs tests/personalization.test.mjs
```

Yönlendirme, ısı politikası, kişiselleştirme, sistem promptu ve sürüm tutarlılığı test edilir.
Sistem promptunu `js/prompts/systemPrompt.js` içinde değiştirirsen `node tools/export-system-prompt.mjs` ile Ollama kopyasını da yenile.

---

## 🔐 Güvenlik

API anahtarları, `.jks` keystore ve şifreleri repoya konmaz (`.gitignore`). Tarayıcıya girilen kişisel anahtarlar yalnızca o cihazın localStorage'ında durur.

---

<div align="center">

**Lotus AI — Built for the future.** 🌸

<sub>Düşün. Üret. Geliş.</sub>

</div>
