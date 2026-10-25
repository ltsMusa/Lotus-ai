# Supabase kurulum listesi

Kodun yapabildiği her şey uygulamada yapıldı. Aşağıdakiler **Supabase panelinden** (supabase.com → projen) yapılır; kod bunları senin yerine açamaz. Giriş yapılamıyorsa en sık sebep 1, 2 ve 3. maddedir.

## 1. Adres ayarları — *Authentication → URL Configuration*

- **Site URL:** uygulamanın yayın adresi (örn. `https://lotus-ai.vercel.app`).
- **Redirect URLs:** aynı adresi `/**` ile ekle (örn. `https://lotus-ai.vercel.app/**`). Yerelde denerken `http://localhost:8080/**` de ekleyebilirsin.

Bu olmazsa doğrulama ve şifre sıfırlama e-postalarındaki bağlantı yanlış yere (çoğu zaman `localhost`) gider ve “bağlantı açılmıyor / süresi dolmuş” gibi görünür.

Android uygulamasında e-posta bağlantıları, ayarlardaki sunucu (proxy) adresine döner; sunucu adresi boşsa Site URL kullanılır.

## 2. E-posta doğrulaması — *Authentication → Sign In / Providers → Email*

- **Confirm email açık** (varsayılan): kayıttan sonra kişi e-postadaki bağlantıya dokunmadan giriş yapamaz. Uygulama bunu söyler ve “yeniden gönder” düğmesi gösterir.
- **Confirm email kapalı:** kayıt olunca direkt giriş yapılır. Deneme aşamasında en rahatı budur.

Hangisini seçtiğin sana kalmış; uygulama ikisiyle de çalışır.

## 3. E-posta gönderimi (SMTP) — *Authentication → Emails → SMTP Settings*

Supabase'in hazır e-posta servisi çok sınırlıdır (saatte birkaç e-posta, yalnızca ekibindeki adreslere). Gerçek kullanıcı alacaksan kendi SMTP'ni bağla (Resend, Brevo, Gmail uygulama şifresi vb.). “Çok sık e-posta istendi” veya “e-posta gönderilemedi” uyarısı bunun işaretidir.

## 4. Google ile giriş — *Authentication → Sign In / Providers → Google*

1. Google Cloud Console → *APIs & Services → Credentials* → **OAuth client ID** (Web application) oluştur.
2. *Authorized redirect URIs* alanına Supabase'in Google sayfasında yazan **Callback URL**'yi ekle (`https://<proje>.supabase.co/auth/v1/callback`).
3. Client ID ve Client Secret'ı Supabase'deki Google sayfasına yapıştırıp **Enable** et.

Not: Google girişi paketlenmiş Android uygulamasında çalışmaz (Google, WebView içinde OAuth'u engeller ve uygulamanın dönecek bir web adresi yok). Orada e-posta + şifre kullanılır; Google girişi web/PWA sürümünde çalışır.

## 5. Veritabanı — *SQL Editor*

`supabase/schema.sql` dosyasının tamamını yapıştırıp **Run** et. Dosya tekrar tekrar çalıştırılabilir; sohbet, mesaj ve hafıza tablolarını, güvenlik kurallarını (RLS) ve izinleri kurar/yeniler. Sohbetler kaydedilmiyor ya da “permission denied” görüyorsan bu adımı çalıştır.

## 6. İstersen

- *Authentication → Rate Limits:* e-posta ve giriş deneme sınırları.
- *Authentication → Attack Protection:* sızan şifre kontrolü (Pro plan).
- Kütüphanenin internetsiz yedeği için: `tools/fetch-supabase.sh` (npm gerekir).
