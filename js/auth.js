// ==========================================================
// LOTUS AI — AUTHENTICATION
// ==========================================================

const SUPABASE_URL =
    "https://ecveafyfgelsyamoheyn.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_qd7Eqg9Cz_9_fxqSlSFXxg_DLtUFVDb";


// ==========================================================
// SUPABASE CLIENT
// ==========================================================

const supabase =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        }
    );


// ==========================================================
// AUTH
// ==========================================================

const Auth = {

    user: null,

    initialized: false,

    authSubscription: null,

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

    openAuthModal() {

        const modal =
            document.getElementById(
                "auth-modal"
            );

        if (!modal) return;


        this.closeAccountModal();

        this.closeGoogleAccountModal();


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
    // REGISTER
    // ------------------------------------------------------

    async register(
        email,
        password
    ) {

        const {
            data,
            error
        } =
            await supabase.auth.signUp({
                email,
                password
            });


        if (error) {

            console.error(
                "Kayıt hatası:",
                error
            );


            return {

                success: false,

                error:
                    error.message

            };
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


            return {

                success: false,

                error:
                    error.message

            };
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
    // GOOGLE LOGIN
    // ------------------------------------------------------

    async loginWithGoogle() {

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
                    error.message

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

        const {
            error
        } =
            await supabase.auth.signOut();


        if (error) {

            console.error(
                "Çıkış hatası:",
                error
            );


            return {

                success: false,

                error:
                    error.message

            };
        }


        this.user = null;


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
                event === "SIGNED_IN"
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
        // LOGIN
        // ==================================================

        loginButton?.addEventListener(
            "click",
            async () => {

                const email =
                    document
                        .getElementById(
                            "login-email"
                        )
                        ?.value
                        .trim();


                const password =
                    document
                        .getElementById(
                            "login-password"
                        )
                        ?.value;


                if (
                    !email ||
                    !password
                ) {

                    alert(
                        "E-posta ve şifre gerekli."
                    );

                    return;
                }


                loginButton.disabled =
                    true;


                loginButton.textContent =
                    "Giriş yapılıyor...";


                try {

                    const result =
                        await Auth.login(
                            email,
                            password
                        );


                    if (
                        !result.success
                    ) {

                        alert(
                            "Giriş başarısız:\n" +
                            result.error
                        );
                    }

                } finally {

                    loginButton.disabled =
                        false;

                    loginButton.textContent =
                        "Giriş Yap";
                }
            }
        );


        // ==================================================
        // REGISTER
        // ==================================================

        registerButton?.addEventListener(
            "click",
            async () => {

                const email =
                    document
                        .getElementById(
                            "register-email"
                        )
                        ?.value
                        .trim();


                const password =
                    document
                        .getElementById(
                            "register-password"
                        )
                        ?.value;


                if (
                    !email ||
                    !password
                ) {

                    alert(
                        "E-posta ve şifre gerekli."
                    );

                    return;
                }


                if (
                    password.length < 6
                ) {

                    alert(
                        "Şifre en az 6 karakter olmalı."
                    );

                    return;
                }


                registerButton.disabled =
                    true;


                registerButton.textContent =
                    "Hesap oluşturuluyor...";


                try {

                    const result =
                        await Auth.register(
                            email,
                            password
                        );


                    if (
                        !result.success
                    ) {

                        alert(
                            "Kayıt başarısız:\n" +
                            result.error
                        );

                        return;
                    }


                    if (
                        !result.session
                    ) {

                        alert(
                            "Hesabın oluşturuldu! " +
                            "E-posta adresini doğrulaman gerekebilir."
                        );

                    } else {

                        Auth.closeAuthModal();
                    }

                } finally {

                    registerButton.disabled =
                        false;

                    registerButton.textContent =
                        "Hesap Oluştur";
                }
            }
        );


        // ==================================================
        // GOOGLE LOGIN
        // ==================================================

        googleButton?.addEventListener(
            "click",
            async () => {

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

                        alert(
                            "Google girişi başarısız:\n" +
                            result.error
                        );
                    }

                } catch (error) {

                    console.error(
                        "Google giriş hatası:",
                        error
                    );


                    alert(
                        "Google girişi başlatılamadı.\n" +
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
            () => {

                loginPanel?.classList.add(
                    "hidden"
                );


                registerPanel?.classList.remove(
                    "hidden"
                );
            }
        );


        // ==================================================
        // SHOW LOGIN
        // ==================================================

        showLogin?.addEventListener(
            "click",
            () => {

                registerPanel?.classList.add(
                    "hidden"
                );


                loginPanel?.classList.remove(
                    "hidden"
                );
            }
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
                // GOOGLE-COMİNG SOON
                // ------------------------------------------

                if (googleButton) {
                    googleButton.disabled = true;
                   }
                
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

                        alert(
                            "Çıkış yapılamadı:\n" +
                            result.error
                        );
                    }

                } finally {

                    accountLogout.disabled =
                        false;

                    accountLogout.textContent =
                        "🚪 Çıkış Yap";
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

                        alert(
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
                        "🚪 Çıkış Yap";
                }
            }
        );


        // ==================================================
        // INITIAL AUTH
        // ==================================================

        await Auth.init();


        Auth.updateAccountUI();

        Auth.updateAccountModalUI();

        Auth.updateGoogleAccountModalUI();
    }
);
