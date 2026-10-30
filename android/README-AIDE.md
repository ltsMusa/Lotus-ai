# Lotus AI — Android (AIDE) Paketi

Bu klasör, `Lotus AI` web uygulamasını (chat.js, api.js, vb. — aynı kod)
tam ekran bir WebView içinde çalıştıran, standart bir Gradle/Android
projesidir. AIDE'de doğrudan açılabilir.

## Gradle wrapper (`gradlew`) — pakette hazır

`gradlew`, `gradlew.bat` ve `gradle/wrapper/gradle-wrapper.jar` pakette var; wrapper Gradle **6.1.1**'i
kullanacak şekilde ayarlı (`gradle/wrapper/gradle-wrapper.properties`, Android Gradle eklentisi 4.0.1 ile uyumlu).
Jar'ı gerçek bir Gradle ile ürettik ve yerel bir Gradle dağıtımıyla uçtan uca çalıştığını denedik; **AIDE'nin
içinde ve telefonda denemedik.**

- `./gradlew` ilk çalıştığında Gradle 6.1.1'i internetten indirir (yaklaşık 100 MB), sonra önbellekten çalışır.
- Normal **Build/Run** AIDE'nin kendi Gradle'ını kullanır ve wrapper'a dokunmaz; wrapper, AIDE'nin "Signed APK"
  menüsü ya da terminalden `./gradlew assembleRelease` gibi komutlar içindir.
- Wrapper'ı bir sürüme sabitlemek istersen `gradle-wrapper.properties` içindeki `distributionUrl`'yi değiştir
  (Android Gradle eklentisi sürümüyle `build.gradle`'daki birlikte değişmeli).

### İmzasız derleyip elle imzalamak istersen (Gradle'a hiç dokunmadan)

1. AIDE'de projeyi aç, **normal Build/Run** ile derle. Bu sana imzasız (veya debug-imzalı)
   bir `app-release-unsigned.apk` / `app-debug.apk` üretir — genelde `app/build/outputs/apk/` altında.
2. AIDE'nin terminalinde `apksigner`'ı bul: `find / -name "apksigner*" 2>/dev/null`
3. (Varsa) `zipalign -p 4 app-release-unsigned.apk app-release-aligned.apk`
4. `apksigner sign --ks lotusai.jks --ks-key-alias lotusai --out app-release-signed.apk app-release-aligned.apk`
   (zipalign'ı atladıysan doğrudan `app-release-unsigned.apk` dosyasını ver.)
5. İstersen `apksigner verify app-release-signed.apk` ile doğrula, sonra cihaza kur.

## Play Protect: "Android'in eski bir sürümü için tasarlanmış" uyarısı

**Sebep:** Play Protect, uygulamanın `targetSdkVersion` değeri telefonun Android API seviyesinden 2'den fazla
gerideyse bu uyarıyı gösterir ([Google'ın açıklaması](https://developers.google.com/android/play-protect/warning-dev-guidance)).
Eski ayar 29'du; artık **35** (Android 17'ye kadar uyarısız). `MainActivity` da Android 15+'ta ekranın kenardan
kenara çizilmesine göre uyarlandı (klavye ve çentik için boşluk).

**Bedeli:** Hedef 30 ve üstü olunca Android 11+ şunları **şart koşar**
([kaynak](https://developer.android.com/about/versions/11/behavior-changes-11)):
APK **APK Signature Scheme v2 veya üstüyle** imzalı olmalı ve `resources.arsc` sıkıştırılmamış + 4 bayt hizalı olmalı.
Yoksa APK "Uygulama yüklenemedi" der. AIDE'nin kendi "Signed APK" çıktısının bunu sağlayıp sağlamadığını
**doğrulayamadık** — sağlamıyorsa aşağıdaki GitHub derlemesini kullan.

### Önerilen: GitHub'da bulutta derle (AIDE gerekmez)

1. Bu değişiklik `main`'e girdikten sonra GitHub → depo → **Actions** → **Android APK** → **Run workflow**.
   (Telefon tarayıcısında "Run workflow" düğmesi görünmezse tarayıcının **Masaüstü sitesi** seçeneğini aç.)
2. 5–10 dk sonra bitince depodaki **Releases** sayfasında `v7.0.0-beta.1` ön sürümünün altında
   `Lotus-AI-7.0-beta.1.apk` görünür; dokunup indir ve kur. (Aynı dosya, Actions çalıştırmasının altında
   **Artifacts** bölümünde zip olarak da durur.)
3. İş akışı APK'yı kendisi doğrular (imza v2/v3, hedef 35, `resources.arsc`, hizalama); biri tutmazsa
   yayın yapmadan hata verir.

**İmza anahtarı:** Depoya `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD` adlı *Secrets* eklenirse (Settings → Secrets and variables → Actions) hep o **kalıcı**
anahtar kullanılır ve sürümler birbirinin üstüne güncellenir. Eklenmezse her çalıştırmada **geçici** anahtar üretilir:
APK yine yüklenir ama bir sonraki derleme farklı imzalı olur, bu yüzden güncellemeden önce eskisini kaldırman gerekir
(giriş yapmadan sadece cihazda duran sohbetler ve indirilen yerel model silinir; Supabase hesabındakiler silinmez).
Aynı anahtarla imzalanmamış bir APK, eskisinin üstüne **kurulamaz** — AIDE'nin keystore'u ile GitHub'daki farklıdır.

Kullanılan dosyalar: `.github/workflows/android-apk.yml` ve `tools/android-ci/` (AIDE projesiyle aynı kaynak kodu, modern
Gradle ayarlarıyla derler; `android/` klasörüne dokunmaz).

### AIDE ile denemek istersen

`android/app/build.gradle` → `targetSdkVersion 35` zaten ayarlı. AIDE'de Signed APK üret ve kur:
yüklenirse sorun yok. "Uygulama yüklenemedi" derse sebep yukarıdaki imza/hizalama şartıdır; çözüm GitHub derlemesi,
ya da (APK'yı yalnızca kendi telefonunda denemek için) `targetSdkVersion`'ı geçici olarak 29 yapmak — uyarı geri gelir
ama APK yüklenir.

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
- Gradle'ın kendi çıktısı imzasızdır; imzalı APK'yı AIDE'nin "Signed APK" menüsü ya da
  GitHub'daki "Android APK" iş akışı (yukarıda) üretir. Play Store'a yüklemek ayrı bir iştir
  (kalıcı keystore, `.aab`, mağaza kaydı) ve bu pakette yok.

## Sürüm notu

`build.gradle` bilerek eski/tutucu sürümler kullanıyor (Android Gradle eklentisi 4.0.1 + Gradle 6.1.1,
`compileSdkVersion 29`; yalnızca `targetSdkVersion` 35) — AIDE'nin yerleşik (offline) araç zinciri genelde en yeni
sürümden çok bu aralıkla daha sorunsuz çalışıyor. `MainActivity` bu yüzden yalnızca `android.jar` 29'da bulunan API'leri
kullanır; GitHub derlemesi (`tools/android-ci`) ise aynı kodu `compileSdk 35` ile derler. Daha yeni bir AIDE sürümün varsa ve farklı bir sürüm istiyorsa, hem `build.gradle`
hem `gradle/wrapper/gradle-wrapper.properties` dosyalarını birlikte güncelle.

## Not: eski sürümden güncelleme
Önceki paket `file://` adresini kullanıyordu; yeni paket farklı bir
adres kullandığı için eski kurulumda localStorage'da duran sohbetler,
hafıza ve ayarlar yeni sürüme taşınmaz (Supabase hesabındakiler taşınır).
