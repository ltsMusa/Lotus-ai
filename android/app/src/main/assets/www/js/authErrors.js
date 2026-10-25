/**
 * ==========================================================
 * Lotus AI - Auth helpers (pure, no DOM, no network)
 * ==========================================================
 * Supabase reports problems in English (and sometimes only as a bare
 * "Failed to fetch"). This turns them into something a person can act
 * on, and holds the small input rules the sign-in forms share.
 * Unit-tested in tests/auth.test.mjs.
 * ==========================================================
 */

export const PASSWORD_MIN = 6;

// Supabase (bcrypt) refuses anything longer than 72 bytes.
export const PASSWORD_MAX = 72;

export function normalizeEmail(value) {

    return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));
}

/** Returns an error text for a bad password, or "" when it is fine. */
export function passwordProblem(password) {

    const text = String(password ?? "");

    if (!text) return "Şifre gerekli.";

    if (text.length < PASSWORD_MIN) return `Şifre en az ${PASSWORD_MIN} karakter olmalı.`;

    if (new TextEncoder().encode(text).length > PASSWORD_MAX) return `Şifre en fazla ${PASSWORD_MAX} karakter olabilir.`;

    return "";
}

/**
 * @typedef {"credentials"|"unconfirmed"|"exists"|"network"|"rate"|"weak"|"expired"|"disabled"|"invalid-email"|"same-password"|"session"|"mail"|"other"} AuthErrorKind
 */

/**
 * Turns a Supabase auth error (or anything thrown) into a Turkish message.
 * @returns {{kind: AuthErrorKind, message: string}}
 */
export function describeAuthError(error) {

    const code = String(error?.code ?? "").toLowerCase();

    const text = String(error?.message ?? error ?? "").toLowerCase();

    const status = Number(error?.status ?? 0);

    const has = (...parts) => parts.some(part => text.includes(part));

    // --- connection problems come first: nothing else matters when offline
    if (
        has("failed to fetch", "networkerror", "network request failed", "load failed", "fetch failed", "timed out", "timeout") ||
        error?.name === "AuthRetryableFetchError" ||
        (status === 0 && error?.name && /fetch/i.test(String(error.name)))
    ) {

        return { kind: "network", message: "Sunucuya ulaşılamıyor. İnternet bağlantını kontrol edip tekrar dene." };
    }

    if (code === "invalid_credentials" || has("invalid login credentials", "invalid credentials")) {

        return {
            kind: "credentials",
            message: "E-posta ya da şifre hatalı. Hesabın yoksa “Hesap oluştur”u, şifreni unuttuysan “Şifremi unuttum”u dene."
        };
    }

    if (code === "email_not_confirmed" || has("email not confirmed")) {

        return {
            kind: "unconfirmed",
            message: "E-posta adresin henüz doğrulanmamış. Gelen kutundaki (spam klasörü dahil) bağlantıya dokun ya da yeniden gönder."
        };
    }

    if (code === "user_already_exists" || code === "email_exists" || has("already registered", "already been registered", "already exists")) {

        return { kind: "exists", message: "Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene; şifreni unuttuysan “Şifremi unuttum”u kullan." };
    }

    if (code === "same_password" || has("different from the old password", "same as the old")) {

        return { kind: "same-password", message: "Yeni şifre eskisiyle aynı olamaz." };
    }

    if (code === "weak_password" || has("password should be", "password is too", "weak password", "at least 6")) {

        return { kind: "weak", message: "Şifre çok zayıf. En az 6 karakter kullan; harf, rakam ve sembol karıştırmak iyi olur." };
    }

    if (code === "over_email_send_rate_limit" || has("email rate limit", "rate limit exceeded for email", "for security purposes, you can only request this")) {

        return { kind: "rate", message: "Çok sık e-posta istendi. Bir dakika (bazen daha uzun) bekleyip tekrar dene." };
    }

    if (code === "over_request_rate_limit" || status === 429 || has("too many requests", "rate limit")) {

        return { kind: "rate", message: "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene." };
    }

    if (code === "otp_expired" || (has("expired", "invalid or has expired", "token has expired") && !has("jwt", "session"))) {

        return { kind: "expired", message: "Bağlantının süresi dolmuş ya da daha önce kullanılmış. Yeni bir bağlantı iste." };
    }

    if (code === "signup_disabled" || has("signups not allowed", "signup is disabled", "signups are disabled")) {

        return { kind: "disabled", message: "Bu sunucuda yeni hesap açma kapalı." };
    }

    if (code === "email_provider_disabled" || has("email logins are disabled", "email provider is disabled")) {

        return { kind: "disabled", message: "E-posta ile giriş bu sunucuda kapalı. Google ile devam etmeyi dene." };
    }

    if (code === "provider_disabled" || has("provider is not enabled", "unsupported provider")) {

        return { kind: "disabled", message: "Bu giriş yöntemi sunucuda henüz açık değil." };
    }

    if (code === "email_address_invalid" || code === "validation_failed" || has("unable to validate email", "invalid email", "email address", "is invalid")) {

        return { kind: "invalid-email", message: "E-posta adresi geçersiz görünüyor. Yazım hatası olmadığından emin ol." };
    }

    if (code === "user_banned" || has("user is banned")) {

        return { kind: "disabled", message: "Bu hesap engellenmiş." };
    }

    if (code === "session_not_found" || code === "session_expired" || has("auth session missing", "session not found", "jwt expired", "refresh token")) {

        return { kind: "session", message: "Oturumun sona ermiş. Lütfen yeniden giriş yap." };
    }

    if (has("error sending", "sending confirmation", "sending recovery", "smtp")) {

        return { kind: "mail", message: "Sunucu e-posta gönderemedi. Birkaç dakika sonra tekrar dene; sürerse sunucunun e-posta (SMTP) ayarı kontrol edilmeli." };
    }

    const raw = String(error?.message ?? error ?? "").trim();

    return { kind: "other", message: raw ? `Beklenmeyen bir hata oldu: ${raw}` : "Beklenmeyen bir hata oldu. Tekrar dene." };
}

/**
 * What the page was opened for, read from the URL Supabase redirects to
 * (e.g. #access_token=…&type=recovery, or #error_code=otp_expired…).
 * Pure: pass location.hash / location.search in.
 */
export function readAuthRedirect(hash = "", search = "") {

    const params = new URLSearchParams(String(hash).replace(/^#/, ""));

    const query = new URLSearchParams(String(search).replace(/^\?/, ""));

    const get = key => params.get(key) ?? query.get(key) ?? "";

    const type = get("type");

    const errorCode = get("error_code");

    const errorDescription = get("error_description").replace(/\+/g, " ");

    return {
        type,
        isRecovery: type === "recovery",
        isConfirmation: type === "signup" || type === "email_change" || type === "invite" || type === "magiclink",
        hasError: Boolean(errorCode || get("error")),
        errorCode,
        errorDescription
    };
}

/**
 * Where e-mail links (confirm / reset) should lead back to.
 *  • web: this page's own address
 *  • packaged app: the app has no public address, so use the server
 *    (proxy) address when one is set — otherwise let Supabase use its Site URL
 */
export function authRedirectUrl({ packaged, origin = "", pathname = "/", proxyBaseUrl = "" } = {}) {

    if (packaged) {

        const base = String(proxyBaseUrl || "").trim().replace(/\/+$/, "");

        return /^https?:\/\//i.test(base) ? `${base}/` : undefined;
    }

    if (!/^https?:\/\//i.test(origin)) return undefined;

    return `${origin}${String(pathname).replace(/index\.html$/i, "")}`;
}

/** Local storage keys that hold a Supabase session (sb-<project>-auth-token). */
export function isSupabaseSessionKey(key) {

    return /^sb-.+-auth-token(-code-verifier)?$/.test(String(key ?? ""));
}
