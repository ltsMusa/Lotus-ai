// ==========================================================
// LOTUS AI — AUTHENTICATION
// ==========================================================
// E-mail + password, Google, "şifremi unuttum", e-mail
// confirmation (with resend) and password change.
//
// The Supabase client itself — and how it copes with the CDN
// library arriving late or not at all — lives in
// supabaseClient.js; the Turkish error texts and the small input
// rules live in authErrors.js (unit-tested).
// ==========================================================

import { showToast } from "./toast.js";
import { isPackagedApp } from "./env.js";
import config from "./config.js";
import { supabase, ensureSupabase, forgetLocalSession } from "./supabaseClient.js";
import {
    describeAuthError,
    normalizeEmail,
    isValidEmail,
    passwordProblem,
    readAuthRedirect,
    authRedirectUrl
} from "./authErrors.js";

/** Messages used to go through the browser's native notify() box, which
 *  looks out of place (and is awkward inside the Android WebView). */
function notify(message, type = "error") {

    showToast(String(message).replace(/\s*\n\s*/g, " ").trim(), type, 5200);
}

/** Where the links in confirmation / reset e-mails should lead back to. */
function emailRedirect() {

    return authRedirectUrl({
        packaged: isPackagedApp(),
        origin: window.location.origin,
        pathname: window.location.pathname,
        proxyBaseUrl: config.backendProxyBaseUrl
    });
}

// What the page was opened for (e-mail link, expired link…). Read once,
// before supabase-js tidies the address bar.
const urlIntent = readAuthRedirect(window.location.hash, window.location.search);

// ==========================================================
// AUTH
// ==========================================================

const Auth = {

    user: null,

    initialized: false,

    authSubscription: null,

    /** True while the page was opened from a password-reset e-mail link. */
    recoveryMode: urlIntent.isRecovery,

    /** Last e-mail typed into a sign-in form (used by "yeniden gönder"). */
    pendingEmail: "",

    // ------------------------------------------------------
    // STORAGE KEY
    // ------------------------------------------------------

    AUTH_METHOD_KEY:
        "lotus_auth_method",


    // ------------------------------------------------------
    // UPDATE ACCOUNT UI
    // ------------------------------------------------------

    updateAccountUI() {

        const accountButton =
            document.querySelector(
                '.settings-item[data-setting="account"]'
            );

        if (!accountButton) return;


        const label =
            accountButton.querySelector(
                ".settings-label"
            );

        if (!label) return;


        if (this.user) {

            label.innerHTML = `
                <strong>Hesabım</strong>
                <small>${this.escapeHtml(
                    this.user.email ?? ""
                )}</small>
            `;

        } else {

            label.innerHTML = `
                <strong>Hesap</strong>
                <small>Giriş yap ve hesabını yönet</small>
            `;
        }
    },


    // ------------------------------------------------------
    // ESCAPE HTML
    // ------------------------------------------------------

    escapeHtml(value) {

        const div =
            document.createElement("div");

        div.textContent =
            String(value ?? "");

        return div.innerHTML;
    },


    // ------------------------------------------------------
    // GET AUTH METHOD
    // ------------------------------------------------------

    getAuthMethod() {

        return localStorage.getItem(
            this.AUTH_METHOD_KEY
        );
    },


    // ------------------------------------------------------
    // SET AUTH METHOD
    // ------------------------------------------------------

    setAuthMethod(method) {

        if (
            method === "google" ||
            method === "password"
        ) {

            localStorage.setItem(
                this.AUTH_METHOD_KEY,
                method
            );

            console.log(
                "🔐 Lotus giriş yöntemi:",
                method
            );

            return;
        }


        localStorage.removeItem(
            this.AUTH_METHOD_KEY
        );
    },


    // ------------------------------------------------------
    // CLEAR AUTH METHOD
    // ------------------------------------------------------

    clearAuthMethod() {

        localStorage.removeItem(
            this.AUTH_METHOD_KEY
        );

        sessionStorage.removeItem(
            "lotus_google_login_pending"
        );
    },


    // ------------------------------------------------------
    // SET USER
    // ------------------------------------------------------

    setUser(user) {

        this.user =
            user ?? null;


        this.updateAccountUI();

        this.updateAccountModalUI();

        this.updateGoogleAccountModalUI();
    },


    // ------------------------------------------------------
    // UPDATE NORMAL ACCOUNT MODAL
    // ------------------------------------------------------

    updateAccountModalUI() {

        const email =
            this.user?.email ??
            "Kullanıcı";


        const accountEmail =
            document.getElementById(
                "account-email"
            );


        const accountEmailDetail =
            document.getElementById(
                "account-email-detail"
            );


        if (accountEmail) {

            accountEmail.textContent =
                email;
        }


        if (accountEmailDetail) {

            accountEmailDetail.textContent =
                this.user?.email ?? "-";
        }
    },


    // ------------------------------------------------------
    // UPDATE GOOGLE ACCOUNT MODAL
    // ------------------------------------------------------

    updateGoogleAccountModalUI() {

        const email =
            this.user?.email ??
            "Kullanıcı";


        const accountEmail =
            document.getElementById(
                "google-account-email"
            );


        const accountEmailDetail =
            document.getElementById(
                "google-account-email-detail"
            );


        if (accountEmail) {

            accountEmail.textContent =
                email;
        }


        if (accountEmailDetail) {

            accountEmailDetail.textContent =
                email;
        }
    },


    // ------------------------------------------------------
    // OPEN AUTH MODAL
    // ------------------------------------------------------

    openAuthModal(panel = "login") {

        const modal =
            document.getElementById(
                "auth-modal"
            );

        if (!modal) return;

        this.closeAccountModal();

        this.closeGoogleAccountModal();

        this.showAuthPanel(panel);

        modal.classList.remove(
            "hidden"
        );

        modal.hidden = false;

        modal.style.display = "";
    },


    // ------------------------------------------------------
    // CLOSE AUTH MODAL
    // ------------------------------------------------------

    closeAuthModal() {

        const modal =
            document.getElementById(
                "auth-modal"
            );

        if (!modal) return;

        modal.classList.add(
            "hidden"
        );

        modal.hidden = true;

        modal.style.display = "none";

        // Do not leave typed passwords sitting in a hidden form.
        modal.querySelectorAll('input[type="password"]').forEach(input => {

            input.value = "";
        });
    },


    // ------------------------------------------------------
    // PANELS INSIDE THE SIGN-IN WINDOW
    // ------------------------------------------------------

    AUTH_PANELS: ["login", "register", "forgot", "recovery"],

    showAuthPanel(name = "login") {

        const target = this.AUTH_PANELS.includes(name) ? name : "login";

        for (const panel of this.AUTH_PANELS) {

            document.getElementById(`${panel}-panel`)?.classList.toggle("hidden", panel !== target);
        }

        this.setAuthMessage("");

        document.getElementById("resend-confirmation-button")?.classList.add("hidden");

        // Carry the e-mail across panels so nobody has to retype it.
        if (this.pendingEmail) {

            for (const id of ["login-email", "register-email", "forgot-email"]) {

                const input = document.getElementById(id);

                if (input && !input.value) input.value = this.pendingEmail;
            }
        }

        // Pop the keyboard up only where there is a real keyboard.
        if (window.matchMedia?.("(pointer: fine)").matches) {

            document.querySelector(`#${target}-panel input`)?.focus?.();
        }
    },

    /** Shows (or, with "", clears) the line of text at the top of the sign-in window. */
    setAuthMessage(text, type = "error") {

        const box = document.getElementById("auth-message");

        if (!box) return;

        box.textContent = text || "";

        box.classList.toggle("hidden", !text);

        box.classList.remove("is-error", "is-success", "is-info");

        if (text) box.classList.add(`is-${type}`);
    },


    // ------------------------------------------------------
    // OPEN NORMAL ACCOUNT MODAL
    // ------------------------------------------------------

    openAccountModal() {

        const modal =
            document.getElementById(
                "account-modal"
            );


        if (
            !modal ||
            !this.user
        ) {

            return;
        }


        this.updateAccountModalUI();

        this.closeAuthModal();

        this.closeGoogleAccountModal();


        modal.classList.remove(
            "hidden"
        );

        modal.hidden = false;

        modal.style.display = "flex";


        console.log(
            "👤 Normal Account Modal açıldı."
        );
    },


    // ------------------------------------------------------
    // CLOSE NORMAL ACCOUNT MODAL
    // ------------------------------------------------------

    closeAccountModal() {

        const modal =
            document.getElementById(
                "account-modal"
            );

        if (!modal) return;


        modal.classList.add(
            "hidden"
        );

        modal.hidden = true;

        modal.style.display = "none";

        this.resetAccountPasswordForm();
    },

    /** Collapses "Şifreyi değiştir" and wipes what was typed into it. */
    resetAccountPasswordForm() {

        document.getElementById("account-password-form")?.classList.add("hidden");

        document.getElementById("account-password-toggle")?.setAttribute("aria-expanded", "false");

        for (const id of ["account-new-password", "account-new-password-repeat"]) {

            const input = document.getElementById(id);

            if (input) input.value = "";
        }

        const box = document.getElementById("account-password-message");

        if (box) {

            box.textContent = "";

            box.classList.add("hidden");
        }
    },


    // ------------------------------------------------------
    // OPEN GOOGLE ACCOUNT MODAL
    // ------------------------------------------------------

    openGoogleAccountModal() {

        const modal =
            document.getElementById(
                "google-account-modal"
            );


        if (
            !modal ||
            !this.user
        ) {

            console.warn(
                "🔍 Google Account Modal açılamadı."
            );

            return;
        }


        this.updateGoogleAccountModalUI();


        this.closeAuthModal();

        this.closeAccountModal();


        modal.classList.remove(
            "hidden"
        );

        modal.hidden = false;

        modal.style.display = "flex";


        console.log(
            "🔍 Google Account Modal açıldı:",
            this.user.email
        );
    },


    // ------------------------------------------------------
    // CLOSE GOOGLE ACCOUNT MODAL
    // ------------------------------------------------------

    closeGoogleAccountModal() {

        const modal =
            document.getElementById(
                "google-account-modal"
            );

        if (!modal) return;


        modal.classList.add(
            "hidden"
        );

        modal.hidden = true;

        modal.style.display = "none";
    },


    // ------------------------------------------------------
    // REFRESH SESSION
    // ------------------------------------------------------

    async refreshSession() {

        const {
            data,
            error
        } =
            await supabase.auth.getSession();


        if (error) {

            console.error(
                "Session alınamadı:",
                error
            );


            this.setUser(null);

            return null;
        }


        const session =
            data.session ?? null;


        this.setUser(
            session?.user ?? null
        );


        return session;
    },


    // ------------------------------------------------------
    // INIT
    // ------------------------------------------------------

    async init() {

        if (this.initialized) {

            return;
        }


        this.initialized = true;


        console.log(
            "🌸 Lotus Auth başlatılıyor..."
        );


        // Bring the Supabase library in without making the app wait for
        // it; the session shows up through the auth listener when it does.
        ensureSupabase();


        await this.refreshSession();


        if (this.user) {

            console.log(
                "👤 Aktif kullanıcı:",
                this.user.email
            );

            console.log(
                "🔐 Giriş yöntemi:",
                this.getAuthMethod()
            );
        }
    },


    // ------------------------------------------------------
    // CONNECTION
    // ------------------------------------------------------

    /** Makes sure the Supabase library is there before an account action. */
    async ensureConnection() {

        if (await ensureSupabase()) return null;

        return describeAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch" });
    },


    // ------------------------------------------------------
    // REGISTER
    // ------------------------------------------------------

    async register(
        email,
        password
    ) {

        email = normalizeEmail(email);

        this.pendingEmail = email;

        const offline = await this.ensureConnection();

        if (offline) return { success: false, kind: offline.kind, error: offline.message };


        const {
            data,
            error
        } =
            await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: emailRedirect()
                }
            });


        if (error) {

            console.error(
                "Kayıt hatası:",
                error
            );

            const info = describeAuthError(error);

            return { success: false, kind: info.kind, error: info.message };
        }


        // Supabase does not say "already registered" when e-mail
        // confirmation is on (so strangers cannot probe for accounts);
        // it returns a user with no identities and sends nothing.
        if (Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {

            const info = describeAuthError({ code: "user_already_exists" });

            return { success: false, kind: info.kind, error: info.message };
        }


        if (data.session) {

            this.setAuthMethod(
                "password"
            );

            this.setUser(
                data.session.user
            );

        } else {

            this.setUser(null);
        }


        return {

            success: true,

            needsConfirmation: !data.session,

            user:
                data.user ?? null,

            session:
                data.session ?? null

        };
    },


    // ------------------------------------------------------
    // LOGIN WITH PASSWORD
    // ------------------------------------------------------

    async login(
        email,
        password
    ) {

        email = normalizeEmail(email);

        this.pendingEmail = email;

        const offline = await this.ensureConnection();

        if (offline) return { success: false, kind: offline.kind, error: offline.message };


        const {
            data,
            error
        } =
            await supabase.auth.signInWithPassword({

                email,

                password

            });


        if (error) {

            console.error(
                "Giriş hatası:",
                error
            );

            const info = describeAuthError(error);

            return { success: false, kind: info.kind, error: info.message };
        }


        // ÖNEMLİ:
        // Bu oturum kesin olarak e-posta/şifre
        // ile açıldı.

        this.setAuthMethod(
            "password"
        );


        this.setUser(
            data.session?.user ??
            data.user ??
            null
        );


        this.closeAuthModal();


        return {

            success: true,

            user:
                data.user ?? null,

            session:
                data.session ?? null

        };
    },


    // ------------------------------------------------------
    // RESEND CONFIRMATION E-MAIL
    // ------------------------------------------------------

    async resendConfirmation(email) {

        email = normalizeEmail(email || this.pendingEmail);

        if (!isValidEmail(email)) return { success: false, kind: "invalid-email", error: "Önce geçerli bir e-posta adresi yaz." };

        const offline = await this.ensureConnection();

        if (offline) return { success: false, kind: offline.kind, error: offline.message };

        const { error } = await supabase.auth.resend({
            type: "signup",
            email,
            options: { emailRedirectTo: emailRedirect() }
        });

        if (error) {

            console.error("Doğrulama e-postası gönderilemedi:", error);

            const info = describeAuthError(error);

            return { success: false, kind: info.kind, error: info.message };
        }

        return { success: true };
    },


    // ------------------------------------------------------
    // FORGOT PASSWORD
    // ------------------------------------------------------

    async sendPasswordReset(email) {

        email = normalizeEmail(email);

        if (!isValidEmail(email)) return { success: false, kind: "invalid-email", error: "Geçerli bir e-posta adresi yaz." };

        this.pendingEmail = email;

        const offline = await this.ensureConnection();

        if (offline) return { success: false, kind: offline.kind, error: offline.message };

        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: emailRedirect() });

        if (error) {

            console.error("Şifre sıfırlama hatası:", error);

            const info = describeAuthError(error);

            return { success: false, kind: info.kind, error: info.message };
        }

        // Same answer whether or not the address has an account.
        return { success: true };
    },


    // ------------------------------------------------------
    // CHANGE PASSWORD (also the last step of "şifremi unuttum")
    // ------------------------------------------------------

    async updatePassword(password) {

        const problem = passwordProblem(password);

        if (problem) return { success: false, kind: "weak", error: problem };

        const offline = await this.ensureConnection();

        if (offline) return { success: false, kind: offline.kind, error: offline.message };

        const { error } = await supabase.auth.updateUser({ password });

        if (error) {

            console.error("Şifre güncellenemedi:", error);

            const info = describeAuthError(error);

            return { success: false, kind: info.kind, error: info.message };
        }

        this.recoveryMode = false;

        return { success: true };
    },


    // ------------------------------------------------------
    // GOOGLE LOGIN
    // ------------------------------------------------------

    async loginWithGoogle() {

        // Google OAuth redirects back to a real http(s) URL — that's
        // fundamentally incompatible with a packaged app loaded from
        // file:///android_asset/... (no such URL exists to redirect
        // back to, and Google's OAuth console won't allow file:// as
        // a redirect URI anyway). Rather than attempting a redirect
        // that can only fail/hang, fail fast with an honest message.
        // Making Google sign-in work in the packaged app for real
        // needs either a native Google Sign-In SDK integration or a
        // custom URL scheme + Android intent-filter deep link — both
        // beyond a JS-only fix.
        if (isPackagedApp()) {

            return {
                success: false,
                error: "Google ile giriş, uygulama içinde (paketlenmiş halde) henüz desteklenmiyor. " +
                    "Lütfen web sürümünden giriş yap, ya da e-posta/şifre ile devam et."
            };
        }

        const offline = await this.ensureConnection();

        if (offline) return { success: false, kind: offline.kind, error: offline.message };

        const redirectTo =
            `${window.location.origin}${window.location.pathname}`;


        // OAuth başlatıldığını kaydet.

        sessionStorage.setItem(
            "lotus_google_login_pending",
            "true"
        );


        const {
            data,
            error
        } =
            await supabase.auth.signInWithOAuth({

                provider:
                    "google",

                options: {

                    redirectTo
                }

            });


        if (error) {

            console.error(
                "Google giriş hatası:",
                error
            );


            sessionStorage.removeItem(
                "lotus_google_login_pending"
            );


            return {

                success: false,

                error:
                    describeAuthError(error).message

            };
        }


        return {

            success: true,

            data

        };
    },


    // ------------------------------------------------------
    // LOGOUT
    // ------------------------------------------------------

    async logout() {

        // "local": sign out of THIS device only. The default ("global")
        // also kicked the account out of the phone/web app it was
        // open on elsewhere.
        const {
            error
        } =
            await supabase.auth.signOut({ scope: "local" });


        if (error) {

            console.error(
                "Çıkış hatası:",
                error
            );

            // Could not reach the server (offline / expired session):
            // still sign out on this device instead of leaving the
            // person stuck in an account they cannot leave.
            forgetLocalSession();
        }


        this.user = null;

        this.recoveryMode = false;

        this.clearAuthMethod();

        this.closeAuthModal();

        this.closeAccountModal();

        this.closeGoogleAccountModal();

        this.updateAccountUI();

        console.log(
            "🚪 Lotus hesabından çıkış yapıldı."
        );

        return {
            success: true
        };
    },


    // ------------------------------------------------------
    // GET USER
    // ------------------------------------------------------

    async getUser() {

        const {
            data,
            error
        } =
            await supabase.auth.getUser();


        if (error) {

            console.error(
                "Kullanıcı alınamadı:",
                error
            );


            return null;
        }


        this.setUser(
            data.user ?? null
        );


        return this.user;
    },


    // ------------------------------------------------------
    // GET CURRENT USER
    // ------------------------------------------------------

    async getCurrentUser() {

        if (this.user) {

            return this.user;
        }


        const session =
            await this.refreshSession();


        return (
            session?.user ??
            null
        );
    },


    // ------------------------------------------------------
    // GET SESSION
    // ------------------------------------------------------

    async getSession() {

        const {
            data,
            error
        } =
            await supabase.auth.getSession();


        if (error) {

            console.error(
                "Session alınamadı:",
                error
            );


            return null;
        }


        return data.session ?? null;
    }

};


// ==========================================================
// AUTH STATE LISTENER
// ==========================================================

const {
    data: authStateSubscription
} =
    supabase.auth.onAuthStateChange(
        (event, session) => {

            console.log(
                "🌸 Lotus Auth:",
                event
            );


            // ----------------------------------------------
            // GOOGLE OAUTH SONRASI
            // ----------------------------------------------

            if (
                event === "SIGNED_IN"
            ) {

                const googlePending =
                    sessionStorage.getItem(
                        "lotus_google_login_pending"
                    );


                if (googlePending === "true") {

                    Auth.setAuthMethod(
                        "google"
                    );


                    sessionStorage.removeItem(
                        "lotus_google_login_pending"
                    );


                    console.log(
                        "🔍 Google OAuth oturumu algılandı."
                    );

                } else if (
                    !Auth.getAuthMethod()
                ) {

                    // Eğer yöntem bilinmiyorsa
                    // varsayılan olarak password kabul et.

                    Auth.setAuthMethod(
                        "password"
                    );
                }
            }


            // ----------------------------------------------
            // PASSWORD RESET LINK OPENED
            // ----------------------------------------------

            if (
                event === "PASSWORD_RECOVERY"
            ) {

                Auth.recoveryMode = true;

                Auth.setUser(
                    session?.user ?? null
                );

                Auth.openAuthModal("recovery");

                return;
            }


            // ----------------------------------------------
            // SIGNED OUT
            // ----------------------------------------------

            if (
                event === "SIGNED_OUT"
            ) {

                Auth.clearAuthMethod();

                Auth.setUser(null);

                Auth.closeAuthModal();

                Auth.closeAccountModal();

                Auth.closeGoogleAccountModal();

                return;
            }


            // ----------------------------------------------
            // USER
            // ----------------------------------------------

            Auth.setUser(
                session?.user ?? null
            );


            // ----------------------------------------------
            // SIGNED IN
            // ----------------------------------------------

            if (
                event === "SIGNED_IN" &&
                !Auth.recoveryMode
            ) {

                Auth.closeAuthModal();
            }
        }
    );


Auth.authSubscription =
    authStateSubscription;


// ==========================================================
// UI
// ==========================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {


        // ==================================================
        // AUTH ELEMENTS
        // ==================================================

        const loginPanel =
            document.getElementById(
                "login-panel"
            );


        const registerPanel =
            document.getElementById(
                "register-panel"
            );


        const loginButton =
            document.getElementById(
                "login-button"
            );


        const registerButton =
            document.getElementById(
                "register-button"
            );


        const googleButton =
            document.getElementById(
                "google-login-button"
            );


        const showRegister =
            document.getElementById(
                "show-register"
            );


        const showLogin =
            document.getElementById(
                "show-login"
            );


        const authClose =
            document.getElementById(
                "auth-close"
            );


        const forgotLink =
            document.getElementById(
                "forgot-password-button"
            );


        const forgotButton =
            document.getElementById(
                "forgot-button"
            );


        const forgotBack =
            document.getElementById(
                "forgot-back"
            );


        const recoveryButton =
            document.getElementById(
                "recovery-button"
            );


        const resendButton =
            document.getElementById(
                "resend-confirmation-button"
            );


        // ==================================================
        // ACCOUNT ELEMENTS
        // ==================================================

        const accountButton =
            document.querySelector(
                '.settings-item[data-setting="account"]'
            );


        const accountClose =
            document.getElementById(
                "account-close"
            );


        const accountLogout =
            document.getElementById(
                "account-logout"
            );


        // ==================================================
        // GOOGLE ACCOUNT ELEMENTS
        // ==================================================

        const googleAccountClose =
            document.getElementById(
                "google-account-close"
            );


        const googleAccountLogout =
            document.getElementById(
                "google-account-logout"
            );


        // ==================================================
        // SHARED HELPERS
        // ==================================================

        /** Runs an action with the button locked and its label swapped. */
        async function busy(button, label, action) {

            if (!button || button.disabled) return;

            const original = button.textContent;

            button.disabled = true;

            button.textContent = label;

            try {

                return await action();

            } finally {

                button.disabled = false;

                button.textContent = original;
            }
        }

        /** "Doğrulama e-postasını yeniden gönder" — shown after a sign-up or a refused sign-in. */
        let resendTimer = null;

        function offerResend(show) {

            if (!resendButton) return;

            resendButton.classList.toggle("hidden", !show);

            if (!show) {

                clearInterval(resendTimer);

                resendButton.disabled = false;

                resendButton.textContent = "Doğrulama e-postasını yeniden gönder";
            }
        }

        function cooldownResend(seconds = 60) {

            if (!resendButton) return;

            let left = seconds;

            resendButton.disabled = true;

            clearInterval(resendTimer);

            const tick = () => {

                if (left <= 0) {

                    clearInterval(resendTimer);

                    resendButton.disabled = false;

                    resendButton.textContent = "Doğrulama e-postasını yeniden gönder";

                    return;
                }

                resendButton.textContent = `Yeniden gönder (${left} sn)`;

                left -= 1;
            };

            tick();

            resendTimer = setInterval(tick, 1000);
        }

        const valueOf = id => document.getElementById(id)?.value ?? "";


        // ==================================================
        // LOGIN
        // ==================================================

        loginButton?.addEventListener(
            "click",
            async () => {

                const email = normalizeEmail(valueOf("login-email"));

                const password = valueOf("login-password");

                Auth.setAuthMessage("");

                offerResend(false);

                if (!email || !password) {

                    Auth.setAuthMessage("E-posta ve şifre gerekli.");

                    return;
                }

                if (!isValidEmail(email)) {

                    Auth.setAuthMessage("E-posta adresi geçersiz görünüyor. Yazım hatası olmadığından emin ol.");

                    return;
                }

                await busy(loginButton, "Giriş yapılıyor...", async () => {

                    const result = await Auth.login(email, password);

                    if (result.success) {

                        notify("Giriş yapıldı. Hoş geldin!", "success");

                        return;
                    }

                    Auth.setAuthMessage(result.error);

                    if (result.kind === "unconfirmed") offerResend(true);
                });
            }
        );


        // ==================================================
        // REGISTER
        // ==================================================

        registerButton?.addEventListener(
            "click",
            async () => {

                const email = normalizeEmail(valueOf("register-email"));

                const password = valueOf("register-password");

                Auth.setAuthMessage("");

                offerResend(false);

                if (!email || !password) {

                    Auth.setAuthMessage("E-posta ve şifre gerekli.");

                    return;
                }

                if (!isValidEmail(email)) {

                    Auth.setAuthMessage("E-posta adresi geçersiz görünüyor. Yazım hatası olmadığından emin ol.");

                    return;
                }

                const problem = passwordProblem(password);

                if (problem) {

                    Auth.setAuthMessage(problem);

                    return;
                }

                await busy(registerButton, "Hesap oluşturuluyor...", async () => {

                    const result = await Auth.register(email, password);

                    if (!result.success) {

                        Auth.setAuthMessage(result.error);

                        return;
                    }

                    if (result.needsConfirmation) {

                        Auth.setAuthMessage(
                            `Hesabın oluşturuldu. ${email} adresine bir doğrulama bağlantısı gönderdik; ` +
                            "bağlantıya dokunduktan sonra buraya dönüp giriş yap. Gelmediyse spam klasörüne bak.",
                            "success"
                        );

                        offerResend(true);

                        return;
                    }

                    notify("Hesabın oluşturuldu. Hoş geldin!", "success");

                    Auth.closeAuthModal();
                });
            }
        );


        // ==================================================
        // RESEND CONFIRMATION
        // ==================================================

        resendButton?.addEventListener(
            "click",
            async () => {

                if (resendButton.disabled) return;

                const email = normalizeEmail(
                    Auth.pendingEmail || valueOf("login-email") || valueOf("register-email")
                );

                resendButton.disabled = true;

                resendButton.textContent = "Gönderiliyor...";

                const result = await Auth.resendConfirmation(email);

                if (!result.success) {

                    Auth.setAuthMessage(result.error);

                    resendButton.disabled = false;

                    resendButton.textContent = "Doğrulama e-postasını yeniden gönder";

                    return;
                }

                Auth.setAuthMessage(`Doğrulama e-postası ${email} adresine yeniden gönderildi. Spam klasörüne de bak.`, "success");

                cooldownResend(60);
            }
        );


        // ==================================================
        // FORGOT PASSWORD
        // ==================================================

        forgotLink?.addEventListener(
            "click",
            () => {

                const typed = normalizeEmail(valueOf("login-email"));

                if (typed) Auth.pendingEmail = typed;

                Auth.showAuthPanel("forgot");
            }
        );

        forgotBack?.addEventListener(
            "click",
            () => Auth.showAuthPanel("login")
        );

        forgotButton?.addEventListener(
            "click",
            async () => {

                const email = normalizeEmail(valueOf("forgot-email"));

                Auth.setAuthMessage("");

                if (!isValidEmail(email)) {

                    Auth.setAuthMessage("Hesabında kullandığın e-posta adresini yaz.");

                    return;
                }

                await busy(forgotButton, "Gönderiliyor...", async () => {

                    const result = await Auth.sendPasswordReset(email);

                    if (!result.success) {

                        Auth.setAuthMessage(result.error);

                        return;
                    }

                    Auth.setAuthMessage(
                        `Bu adreste bir hesap varsa ${email} adresine şifre sıfırlama bağlantısı gönderdik. ` +
                        "Bağlantıya dokun, yeni şifreni belirle ve sonra giriş yap. Gelmediyse spam klasörüne bak.",
                        "success"
                    );
                });
            }
        );


        // ==================================================
        // NEW PASSWORD (after the reset link)
        // ==================================================

        recoveryButton?.addEventListener(
            "click",
            async () => {

                const first = valueOf("recovery-password");

                const second = valueOf("recovery-password-repeat");

                Auth.setAuthMessage("");

                const problem = passwordProblem(first);

                if (problem) {

                    Auth.setAuthMessage(problem);

                    return;
                }

                if (first !== second) {

                    Auth.setAuthMessage("Şifreler birbiriyle aynı değil.");

                    return;
                }

                await busy(recoveryButton, "Güncelleniyor...", async () => {

                    const result = await Auth.updatePassword(first);

                    if (!result.success) {

                        Auth.setAuthMessage(result.error);

                        return;
                    }

                    Auth.setAuthMethod("password");

                    Auth.closeAuthModal();

                    notify("Şifren güncellendi. Artık yeni şifrenle giriş yapabilirsin.", "success");
                });
            }
        );


        // ==================================================
        // ENTER KEY
        // ==================================================

        const enterSubmits = {
            "login-email": loginButton,
            "login-password": loginButton,
            "register-email": registerButton,
            "register-password": registerButton,
            "forgot-email": forgotButton,
            "recovery-password": recoveryButton,
            "recovery-password-repeat": recoveryButton
        };

        for (const [id, button] of Object.entries(enterSubmits)) {

            document.getElementById(id)?.addEventListener("keydown", event => {

                if (event.key === "Enter" && !event.isComposing) {

                    event.preventDefault();

                    button?.click();
                }
            });
        }


        // ==================================================
        // GOOGLE LOGIN
        // ==================================================

        googleButton?.addEventListener(
            "click",
            async () => {

                Auth.setAuthMessage("");

                googleButton.disabled =
                    true;


                googleButton.textContent =
                    "Google açılıyor...";


                try {

                    const result =
                        await Auth.loginWithGoogle();


                    if (
                        !result.success
                    ) {

                        Auth.setAuthMessage(result.error);
                    }

                } catch (error) {

                    console.error(
                        "Google giriş hatası:",
                        error
                    );


                    Auth.setAuthMessage(
                        "Google girişi başlatılamadı: " +
                        (
                            error?.message ??
                            error
                        )
                    );

                } finally {

                    googleButton.disabled =
                        false;

                    googleButton.textContent =
                        "Google ile devam et";
                }
            }
        );


        // ==================================================
        // SHOW REGISTER
        // ==================================================

        showRegister?.addEventListener(
            "click",
            () => Auth.showAuthPanel("register")
        );


        // ==================================================
        // SHOW LOGIN
        // ==================================================

        showLogin?.addEventListener(
            "click",
            () => Auth.showAuthPanel("login")
        );


        // ==================================================
        // CLOSE AUTH
        // ==================================================

        authClose?.addEventListener(
            "click",
            () => {

                Auth.closeAuthModal();
            }
        );


        // ==================================================
        // ACCOUNT BUTTON
        // ==================================================

        accountButton?.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                event.stopImmediatePropagation();


                console.log(
                    "🌸 ACCOUNT BUTTON TIKLANDI"
                );


                let user =
                    Auth.user;


                if (!user) {

                    user =
                        await Auth.getCurrentUser();
                }


                // ------------------------------------------
                // GİRİŞ YOK
                // ------------------------------------------

                if (!user) {

                    console.log(
                        "🔐 Giriş yok → Auth Modal"
                    );


                    Auth.openAuthModal();

                    return;
                }


                // ------------------------------------------
                // GİRİŞ YÖNTEMİ
                // ------------------------------------------

                const method =
                    Auth.getAuthMethod();


                console.log(
                    "🔐 Aktif giriş yöntemi:",
                    method
                );


                // ------------------------------------------
                // GOOGLE HESABI
                // ------------------------------------------

                if (
                    method === "google"
                ) {

                    Auth.openGoogleAccountModal();

                    return;
                }


                // ------------------------------------------
                // E-POSTA + ŞİFRE
                // ------------------------------------------

                Auth.openAccountModal();
            },
            true
        );


        // ==================================================
        // NORMAL ACCOUNT CLOSE
        // ==================================================

        accountClose?.addEventListener(
            "click",
            event => {

                event.preventDefault();

                event.stopPropagation();


                Auth.closeAccountModal();
            }
        );


        // ==================================================
        // NORMAL ACCOUNT LOGOUT
        // ==================================================

        accountLogout?.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                event.stopPropagation();


                accountLogout.disabled =
                    true;


                accountLogout.textContent =
                    "Çıkış yapılıyor...";


                try {

                    const result =
                        await Auth.logout();


                    if (
                        !result.success
                    ) {

                        notify(
                            "Çıkış yapılamadı:\n" +
                            result.error
                        );
                    }

                } finally {

                    accountLogout.disabled =
                        false;

                    accountLogout.textContent =
                        "Çıkış Yap";
                }
            }
        );


        // ==================================================
        // GOOGLE ACCOUNT CLOSE
        // ==================================================

        googleAccountClose?.addEventListener(
            "click",
            event => {

                event.preventDefault();

                event.stopPropagation();


                Auth.closeGoogleAccountModal();
            }
        );


        // ==================================================
        // GOOGLE ACCOUNT LOGOUT
        // ==================================================

        googleAccountLogout?.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                event.stopPropagation();


                googleAccountLogout.disabled =
                    true;


                googleAccountLogout.textContent =
                    "Çıkış yapılıyor...";


                try {

                    const result =
                        await Auth.logout();


                    if (
                        !result.success
                    ) {

                        notify(
                            "Çıkış yapılamadı:\n" +
                            result.error
                        );

                        return;
                    }


                    Auth.closeGoogleAccountModal();

                } finally {

                    googleAccountLogout.disabled =
                        false;

                    googleAccountLogout.textContent =
                        "Çıkış Yap";
                }
            }
        );


        // ==================================================
        // CHANGE PASSWORD (inside "Hesabım")
        // ==================================================

        const passwordToggle = document.getElementById("account-password-toggle");

        const passwordForm = document.getElementById("account-password-form");

        const passwordSave = document.getElementById("account-password-save");

        const passwordMessage = document.getElementById("account-password-message");

        function passwordNote(text, type = "error") {

            if (!passwordMessage) return;

            passwordMessage.textContent = text || "";

            passwordMessage.classList.toggle("hidden", !text);

            passwordMessage.classList.remove("is-error", "is-success", "is-info");

            if (text) passwordMessage.classList.add(`is-${type}`);
        }

        passwordToggle?.addEventListener(
            "click",
            () => {

                const open = passwordForm?.classList.contains("hidden");

                passwordForm?.classList.toggle("hidden", !open);

                passwordToggle.setAttribute("aria-expanded", String(open));

                passwordNote("");

                if (open && window.matchMedia?.("(pointer: fine)").matches) {

                    document.getElementById("account-new-password")?.focus();
                }
            }
        );

        passwordSave?.addEventListener(
            "click",
            async () => {

                const first = valueOf("account-new-password");

                const second = valueOf("account-new-password-repeat");

                passwordNote("");

                const problem = passwordProblem(first);

                if (problem) return passwordNote(problem);

                if (first !== second) return passwordNote("Şifreler birbiriyle aynı değil.");

                await busy(passwordSave, "Kaydediliyor...", async () => {

                    const result = await Auth.updatePassword(first);

                    if (!result.success) return passwordNote(result.error);

                    Auth.resetAccountPasswordForm();

                    notify("Şifren güncellendi.", "success");
                });
            }
        );

        for (const id of ["account-new-password", "account-new-password-repeat"]) {

            document.getElementById(id)?.addEventListener("keydown", event => {

                if (event.key === "Enter" && !event.isComposing) {

                    event.preventDefault();

                    passwordSave?.click();
                }
            });
        }


        // ==================================================
        // INITIAL AUTH
        // ==================================================

        await Auth.init();

        handleAuthRedirect();


        Auth.updateAccountUI();

        Auth.updateAccountModalUI();

        Auth.updateGoogleAccountModalUI();
    }
);


// ==========================================================
// E-MAIL LINKS (doğrulama / şifre sıfırlama)
// ==========================================================

/** Reacts to what the page was opened for — see `urlIntent` above. Runs once, after Auth.init(). */
function handleAuthRedirect() {

    if (urlIntent.hasError) {

        const info = describeAuthError({ code: urlIntent.errorCode, message: urlIntent.errorDescription });

        notify(info.message, "error");

        // A used / expired link: go straight to asking for a new one.
        if (info.kind === "expired") Auth.openAuthModal(urlIntent.type === "recovery" || /recover|reset/i.test(urlIntent.errorDescription) ? "forgot" : "login");

    } else if (urlIntent.isRecovery) {

        // The PASSWORD_RECOVERY event normally opens this already; this covers a late library load.
        if (Auth.user) Auth.openAuthModal("recovery");

    } else if (urlIntent.isConfirmation) {

        if (Auth.user) {

            notify("E-postan doğrulandı. Hoş geldin!", "success");

        } else {

            notify("E-postan doğrulandı. Şimdi giriş yapabilirsin.", "success");

            Auth.openAuthModal("login");
        }
    }

    // Tidy the address bar so a refresh doesn't replay the link — but only
    // once the Supabase library has read the tokens out of it. Wiping the
    // address while the library is still loading would throw the e-mail
    // link away (that is exactly how "doğrulama bağlantısı çalışmıyor" happens).
    if (/access_token|refresh_token|error_code|type=/.test(window.location.hash)) {

        ensureSupabase().then(ready => {

            if (!ready) return; // offline: keep the link so the next attempt can still use it

            // The library finishes reading the address a moment after it is created.
            setTimeout(() => {

                if (!/access_token|refresh_token|error_code|type=/.test(window.location.hash)) return;

                try {

                    window.history.replaceState(null, "", window.location.pathname + window.location.search);

                } catch { /* some WebViews refuse; harmless */ }

            }, 1500);

            // Safety net: if the "password reset" event was missed, open the form anyway.
            if (urlIntent.isRecovery) {

                setTimeout(() => {

                    const modal = document.getElementById("auth-modal");

                    const showing = modal && !modal.classList.contains("hidden") && !document.getElementById("recovery-panel")?.classList.contains("hidden");

                    if (Auth.recoveryMode && Auth.user && !showing) Auth.openAuthModal("recovery");

                }, 600);
            }
        });
    }
}


// ==========================================================
// EXPORTS
// ==========================================================
// auth.js is loaded as an ES module, so "Auth" and "supabase"
// are NOT global by default. memory.js, storage.js and other
// modules need real access to both — export them explicitly
// instead of relying on implicit globals (this was previously
// broken: memory.js referenced Auth/supabase as if global and
// threw a ReferenceError the moment any memory function ran).

export { supabase, Auth };
