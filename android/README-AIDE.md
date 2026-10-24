# Lotus AI — Android (AIDE) Paketi

Bu klasör, `Lotus AI` web uygulamasını (chat.js, api.js, vb. — aynı kod)
tam ekran bir WebView içinde çalıştıran, standart bir Gradle/Android
projesidir. AIDE'de doğrudan açılabilir.

## ⚠️ ÖNCE BUNU OKU — Signed APK için gradlew'e hiç gerek yok

`gradle/wrapper/gradle-wrapper.jar` bu pakette yok — derlenmiş bir Java
binary'si, benim ortamımda internet ve Gradle kurulumu olmadığı için
üretemiyorum. Ama iyi haber: **buna hiç ihtiyacın yok.** `gradlew`
sadece AIDE'nin "Build **Signed** APK" menüsünün özel olarak çağırdığı
bir yol — normal "Build APK" AIDE'nin kendi bundled Gradle'ını
kullanıyor ve `./gradlew`'e hiç dokunmuyor. Yani imzalamayı Gradle'ın
dışına çıkarıp elle yapıyoruz:

### Adımlar
1. AIDE'de projeyi aç, **normal Build/Run** ile derle (Signed APK
   menüsünü KULLANMA). Bu sana imzasız (veya debug-imzalı) bir
   `app-release-unsigned.apk` / `app-debug.apk` üretir — genelde
   `app/build/outputs/apk/` altında.
2. AIDE'nin terminalini aç, `apksigner`'ı bul:
   ```
   find / -name "apksigner*" 2>/dev/null
   ```
   (Genelde AIDE'nin kendi Android SDK build-tools klasöründe olur.)
3. (Varsa) `zipalign` ile hizala — bazı cihazlar/Play Store bunu ister:
   ```
   zipalign -p 4 app-release-unsigned.apk app-release-aligned.apk
   ```
4. `apksigner` ile kendi keystore'unla imzala:
   ```
   apksigner sign --ks lotusai.jks --ks-key-alias lotusai \
       --out app-release-signed.apk \
       app-release-aligned.apk
   ```
   (zipalign adımını atladıysan doğrudan `app-release-unsigned.apk`
   dosyasını ver.) Keystore ve key şifreleri sorulacak.
5. `apksigner verify app-release-signed.apk` ile imzayı doğrula
   (opsiyonel ama önerilir).
6. Üretilen `app-release-signed.apk`'yı cihaza kur.

Bu yol tamamen `gradlew`/`gradle-wrapper.jar`'dan bağımsız — hiçbir
şeyi başka bir projeden taşımana gerek yok.

## Nasıl açılır

1. Bu klasörün tamamını telefonuna aktar (zip'i aç).
2. AIDE'yi aç → "Open Folder/Project" → bu klasörü (`LotusAI-Android/`)
   seç. `settings.gradle` dosyasını görünce AIDE'nin bunu bir Gradle
   projesi olarak tanıması gerekir.
3. AIDE'nin kendi Gradle/SDK bileşenlerini indirmesini bekle (ilk açılışta
   internet ister).
4. Build (çekiç ikonu) → APK üretilir → cihaza kur.

## Neler yapıldı (tam ekran + AIDE için gerekenler)

- **Tam ekran**: web CSS'iyle yapılamaz — `MainActivity.java` bunu native
  olarak yapıyor: başlık çubuğu yok, `immersive sticky` modla durum/gezinme
  çubukları gizli (kenardan kaydırınca kısa süreliğine çıkıp otomatik
  tekrar gizleniyor).
- **`assets/www/`**: mevcut web uygulamanın birebir kopyası
  (`index.html`, `css/`, `js/`, `assets/`). Web'i güncelleyince bu klasörü
  yeniden kopyala. `api/` ve `supabase/` klasörleri
  buraya kopyalanmadı — onlar sunucu tarafı dosyalar, telefonda işe
  yaramaz.
- **Harici linkler** (`window.open`, `target="_blank"` — "API Key Al↗"
  butonları, Groq konsolu): WebView'de varsayılan olarak hiçbir şey
  yapmaz. `onCreateWindow` override edilerek bunlar sistem tarayıcısında
  açılıyor, uygulamayı terk etmiyorsun.
- **Dosya ekleme** (📎, `js/attachments.js`): `onShowFileChooser`
  override edilerek gerçek Android dosya seçici açılıyor.
- **Mikrofon** (🎤, `js/speech.js`): `RECORD_AUDIO` izni + WebView'in
  kendi `onPermissionRequest` onayı ikisi birden ekli.
- **Geri tuşu**: WebView geçmişinde geri gider, geçmiş yoksa uygulamadan
  çıkar.
- **Yerel ağ (Ollama) için cleartext**: `res/xml/network_security_config.xml`
  ile `http://` (HTTPS değil) yerel Ollama sunucusuna bağlanmaya izin
  veriliyor — sadece bunun için, Groq/OpenAI/Gemini zaten HTTPS.

## ⚠️ Paketlemeden önce MUTLAKA yapman gereken tek ayar

Uygulama bir web sunucusundan değil, telefonun içinden çalışıyor:
sayfa `https://appassets.androidplatform.net/www/index.html` adresiyle
açılıyor ve `MainActivity.shouldInterceptRequest` her isteği doğrudan
`assets/www`'den cevaplıyor (internete çıkmaz). Bu yol bilerek seçildi:
`file:///android_asset/...` ile açılınca Chromium ES modüllerini
engelliyor ve uygulama açılış ekranında takılı kalıyor. Bu yüzden
**göreli `/api/chat` adresine ulaşamıyor** — yani otomatik Groq modu, sen bir şey
yapılandırmadan **çalışmaz**.

Uygulamayı ilk açtığında:
**Ayarlar → Yapay Zekâ → "Sunucu Proxy Adresi"** alanına, `api/chat.js`'i
deploy ettiğin adresi yaz (örn. `https://senin-projen.vercel.app`) —
bunu boş bırakırsan otomatik Groq modu "sunucu proxy adresi
ayarlanmamış" hatası verir. Alternatif: bu alanı boş bırakıp her
sağlayıcı için kendi kişisel API anahtarını gir (proxy hiç gerekmez).

## Dürüstlük notları (bilerek yapılmayanlar)

- **Mikrofon (STT)**: Web Speech API, Google'ın online tanıma servisine
  bağımlı. Bazı cihazlarda/Android sürümlerinde WebView içinde (gerçek
  Chrome uygulaması olmadığı için) hiç çalışmayabilir — bu Android'in
  platform kısıtı, buradan düzeltilemez. Kendi cihazında test et.
- **Ollama**: telefonda native çalışmaz. Ayarlar'dan ağındaki bir
  bilgisayarın Ollama adresini girmen gerekir. (Telefonda internetsiz yapay zekâ için
  Ollama'ya gerek yok: **Lotus Mini** uygulamanın içinde çalışır.)
- **Lotus Mini (cihazda yapay zekâ)**: motor WebAssembly'dir; `assets/www/vendor/wllama/` doluysa APK içinden,
  boşsa ilk kullanımda CDN'den yüklenir. Model dosyası (~469 MB / ~1,04 GB) APK'ya konmadıysa ilk kullanımda
  uygulamadan indirilir. **Bu özellik gerçek bir telefonda henüz denenmedi**: hız, bellek ve ısınma davranışı
  cihaza göre değişir; çok iş parçacığı için gereken `Cross-Origin-Opener/Embedder-Policy` başlıkları
  `MainActivity`'de verilir ama WebView sürümüne bağlıdır — çalışmazsa uygulama kendiliğinden tek iş parçacığına düşer.
- **Isı/pil bilgisi**: `MainActivity` içindeki `LotusNative.getDeviceInfo()` RAM'i, Android ısı durumunu (Android 10+),
  pil sıcaklığını/seviyesini ve güç tasarrufunu verir; eski Android'lerde ısı durumu okunamaz, pil sıcaklığı ve ölçülen
  hız kullanılır.
- **Modeli APK'ya gömmek**: `tools/fetch-local-ai.sh --with-model --android` (bash + npm gerekir; Termux'ta `pkg install nodejs curl`).
  APK yaklaşık 0,5 GB büyür; AIDE'de derleme uzun sürebilir ve bellek isteyebilir — gömmeden de çalışır.
- Bu proje **imzasız (unsigned) debug APK** üretir — sadece kendi
  cihazına kurmak için yeterli. Play Store'a yüklemek istersen ayrı bir
  imzalama (keystore) adımı gerekir, bu pakette yok.

## Sürüm notu

`build.gradle` bilerek eski/tutucu sürümler kullanıyor
(AGP 7.4.2 + Gradle 7.5) — AIDE'nin yerleşik (offline) araç zinciri
genelde en yeni AGP'den çok bu aralıkla daha sorunsuz çalışıyor. Daha
yeni bir AIDE sürümün varsa ve farklı bir AGP istiyorsa, hem
`build.gradle` hem `gradle/wrapper/gradle-wrapper.properties`
dosyalarını birlikte güncelle.

## Not: eski sürümden güncelleme
Önceki paket `file://` adresini kullanıyordu; yeni paket farklı bir
adres kullandığı için eski kurulumda localStorage'da duran sohbetler,
hafıza ve ayarlar yeni sürüme taşınmaz (Supabase hesabındakiler taşınır).
