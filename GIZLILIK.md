# Lotus AI — Gizlilik Notu

**Sürüm:** 7.1 Beta · **Durum:** taslak (beta süresince değişebilir)

Bu not, Lotus AI'ın hangi verileri nerede tuttuğunu ve nereye gönderdiğini sade bir dille anlatır.
Hukuki bir metin değildir; uygulamanın bugünkü davranışını anlatır.

## Kısaca

- Giriş yapmazsan (misafir) sohbetlerin **yalnızca cihazında** durur.
- Giriş yaparsan sohbetlerin, mesajların ve hafızan **Supabase** veritabanında hesabına bağlı saklanır; başka kullanıcılar göremez.
- Mesajlarını yazdığın an, seçili **yapay zekâ sağlayıcısına** gider (aşağıda). Yerel model **Lotus Mini** kullanırsan mesajların cihazından çıkmaz.
- Sohbetler uçtan uca şifreli değildir. Projeyi yöneten kişi veritabanına teknik olarak erişebilir. Parola, kimlik, banka bilgisi gibi hassas şeyleri yazma.

## Hesap

| Veri | Nerede | Not |
|---|---|---|
| E-posta adresi | Supabase (Auth) | Giriş, doğrulama ve şifre sıfırlama e-postaları için |
| Şifre | Supabase (Auth) | Şifren düz metin olarak saklanmaz; biz göremeyiz |
| Google hesabı | Supabase (Auth) | "Google ile devam et"te Google'ın verdiği e-posta |
| API anahtarı (isteğe bağlı) | Supabase (`api_keys`) | Yalnızca **"Anahtarlarımı hesabımda sakla"** açıksa; aşağıya bak |

## Sohbetler ve hafıza (giriş yaptıysan)

Sohbet başlıkları, mesajlar ve "Hafıza" kayıtların Supabase'de, yalnızca senin hesabının okuyup yazabileceği
şekilde (satır düzeyinde güvenlik) tutulur. Böylece sohbetlerin cihazlar arasında senkron kalır.

## Hesabında saklanan API anahtarları (isteğe bağlı)

Anahtar sihirbazında ya da Ayarlar → Yapay Zekâ'da **"Anahtarlarımı hesabımda sakla"** açıksa Groq ve Gemini
anahtarın Supabase'deki `api_keys` tablosuna yazılır; başka bir telefonda giriş yapınca anahtar kendiliğinden gelir.

- **Varsayılan kapalıdır**; anahtarın hesabına yalnızca sen açarsan gider. Sihirbazda onay kutusu olarak sorulur.
- Anahtar **düz metin** olarak saklanır. Satır düzeyinde güvenlik yalnızca senin hesabının okuyup yazmasına izin verir,
  ama Supabase projesini yöneten kişi veritabanına teknik olarak erişebilir ve anahtarı görebilir. Bu yüzden
  anahtarlarını istersen yalnızca cihazında tut; **hesabında tutmak zorunda değilsin**.
- Hesaptaki kopya, anahtarı uygulamadan değiştirdiğinde güncellenir, silip boşalttığında ya da seçeneği kapattığında
  silinir. Anahtarı Groq/Google panelinden iptal etmek ayrıca senin işin.
- Anahtarlar sohbetlerinle birlikte **hiçbir yere gönderilmez**; yalnızca ilgili sağlayıcıya (Groq/Google) istek
  yaparken kullanılır.
- Anahtar sihirbazı, anahtarı bulmak için pano içeriğine bakar: yalnızca Groq (`gsk_…`) ve Gemini (`AIza…`) anahtarına
  benzeyen bir metin varsa onu alır; panodaki başka hiçbir şey saklanmaz ya da gönderilmez. Android'de panoya yalnızca
  uygulama ekrandayken bakılır.
- Kapatırsan hesaptaki kopyalar silinir.

## Cihazında kalanlar

Ayarlar, tema, Kişiselleştirme (hitap, talimatlar), misafir sohbetleri ve — kendin girersen — yapay zekâ
sağlayıcı anahtarların tarayıcının/uygulamanın yerel depolamasında durur. Çıkış yapınca hesabına ait oturum
bilgisi silinir.

## Verilerin başkalarına gittiği yerler

| Ne yaptığında | Kime gider | Ne gider |
|---|---|---|
| Bir yapay zekâ sağlayıcısıyla sohbet | Groq, Google Gemini, OpenAI veya OpenRouter (seçtiğine göre) | Mesajların ve gerekirse eklediğin dosya/görsel |
| "Sunucu üzerinden çalış" açık | Lotus sunucusu (Vercel) → sağlayıcı | Aynısı; sunucu mesajları kendi veritabanına kaydetmez, yalnızca hata durumunda hata kaydı tutar |
| Web araması açık | Tavily, Brave Search, Jina (ve haber/Vikipedi kaynakları) | Mesajından türetilen arama metni |
| Görsel oluşturma (ücretsiz servis) | Pollinations | Görsel tarifin; adres (URL) içinde gider. Tarif, görsel stüdyosundaki "İngilizce tarife çevir" açıksa önce seçili yapay zekâ sağlayıcısıyla (Groq, Gemini…) İngilizceye çevrilip zenginleştirilir ve Pollinations'a o hali gider |
| Görsel oluşturma (Gemini anahtarın varsa) | Google (`generativelanguage.googleapis.com`) | Görsel tarifin ve anahtarın. Gelen görsel sohbetin içinde saklanır: giriş yapmadıysan bu cihazda, yaptıysan hesabındaki sohbetle birlikte |
| Anahtar sihirbazı | Groq (`api.groq.com`) veya Google (`generativelanguage.googleapis.com`) | Yalnızca anahtarı denemek için model listesi isteği; mesaj gitmez |
| Sesle yazma / sesli okuma | Telefonun/tarayıcının konuşma servisi (cihaza göre Google dahil) | Ses |
| İlk kez Lotus Mini indirirken | Hugging Face | Yalnızca model dosyası indirilir; mesajların gitmez |

Bu hizmetlerin kendi gizlilik politikaları geçerlidir. Web aramasını ve sunucu kullanımını Ayarlar'dan kapatabilirsin.

## Silme

- Sohbetleri uygulamadan tek tek silebilirsin.
- **Hafıza → Tümünü sil** ile hafıza kayıtlarını silebilirsin.
- Hesabını tamamen silmek **beta sürümünde uygulama içinde henüz yok**: aşağıdaki adrese yazarsan hesabın ve
  verilerin silinir.

## İletişim ve geri bildirim

Soru, silme isteği veya hata bildirimi için: **[İLETİŞİM E-POSTASI BURAYA YAZILACAK]**
ya da GitHub'da bir [geri bildirim aç](https://github.com/ltsMusa/Lotus-ai/issues/new).
