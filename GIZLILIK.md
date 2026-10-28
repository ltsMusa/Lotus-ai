# Lotus AI — Gizlilik Notu

**Sürüm:** 7.0 Beta 1 · **Durum:** taslak (beta süresince değişebilir)

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

## Sohbetler ve hafıza (giriş yaptıysan)

Sohbet başlıkları, mesajlar ve "Hafıza" kayıtların Supabase'de, yalnızca senin hesabının okuyup yazabileceği
şekilde (satır düzeyinde güvenlik) tutulur. Böylece sohbetlerin cihazlar arasında senkron kalır.

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
| Görsel oluşturma | Pollinations | Yazdığın görsel tarifi |
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
