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
    // ESCAPE USER TEXT
    // ------------------------------------------------------

    escapeHtml(value) {

        const div =
            document.createElement("div");

        div.textContent =
            String(value ?? "");

        return div.innerHTML;
    },


    // ------------------------------------------------------
    // SET USER
    // ------------------------------------------------------

    setUser(user) {

        this.user =
            user ?? null;

        this.updateAccountUI();

        this.updateAccountModalUI();
    },


    // ------------------------------------------------------
    // UPDATE ACCOUNT MODAL UI
    // ------------------------------------------------------

    updateAccountModalUI() {

        const email =
            this.user?.email ?? "Kullanıcı";


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
    // OPEN AUTH MODAL
    // ------------------------------------------------------

    openAuthModal() {

        const modal =
            document.getElementById(
                "auth-modal"
            );

        if (!modal) return;


        this.closeAccountModal();


        modal.classList.remove("hidden");

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


        modal.classList.add("hidden");

        modal.hidden = true;

        modal.style.display = "none";
    },


    // ------------------------------------------------------
    // OPEN ACCOUNT MODAL
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


        modal.classList.remove("hidden");

        modal.hidden = false;

        modal.style.display = "flex";
    },

    // ------------------------------------------------------
// OPEN GOOGLE ACCOUNT MODAL
// ------------------------------------------------------

openGoogleAccountModal() {

    const modal =
        document.getElementById(
            "google-account-modal"
        );

    if (!modal) return;

    const email =
        this.user?.email ?? "Kullanıcı";


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


    // Diğer hesap modalını kapat.

    this.closeAccountModal();


    // Login modalını da kapat.

    this.closeAuthModal();


    modal.classList.remove("hidden");

    modal.hidden = false;

    modal.style.display = "flex";


    console.log(
        "🔍 Google Account Modal açıldı:",
        email
    );

    console.log(
        "🔍 Google Account User:",
        this.user
    );

    console.log(
        "🔍 Provider:",
        this.user?.app_metadata?.provider
    );

    console.log(
        "🔍 Identities:",
        this.user?.identities
    );
},

    // ------------------------------------------------------
    // CLOSE ACCOUNT MODAL
    // ------------------------------------------------------

    closeAccountModal() {

        const modal =
            document.getElementById(
                "account-modal"
            );

        if (!modal) return;


        modal.classList.add("hidden");

        modal.hidden = true;

        modal.style.display = "none";
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

    modal.classList.add("hidden");

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


        await this.refreshSession();
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


        // Session yoksa kullanıcı henüz
        // oturum açmış kabul edilmez.

        this.setUser(
            data.session?.user ?? null
        );


        return {

            success: true,

            user:
                data.user ?? null,

            session:
                data.session ?? null

        };
    },


    // ------------------------------------------------------
    // LOGIN
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


        this.setUser(null);

        this.closeAccountModal();


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
// ÖNEMLİ:
// Bu listener DOMContentLoaded beklemeden kuruluyor.
// Google OAuth redirect sonrası gelen SIGNED_IN /
// INITIAL_SESSION olaylarını kaçırmamak için burada.
// Supabase bunu özellikle OAuth sonrası auth olaylarını
// takip etmek için öneriyor.
// ==========================================================

const {
    data: authStateSubscription
} =
    supabase.auth.onAuthStateChange(
        (event, session) => {

            console.log(
                "Lotus Auth durumu:",
                event
            );


            Auth.setUser(
                session?.user ?? null
            );


            if (
                event === "SIGNED_IN"
            ) {

                Auth.closeAuthModal();
            }


            if (
                event === "SIGNED_OUT"
            ) {

                Auth.closeAuthModal();

                Auth.closeAccountModal();
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
        // GOOGLE
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
        // ACCOUNT SYSTEM
        // ==========================================================

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

        // --------------------------------------------------
// GOOGLE ACCOUNT CLOSE
// --------------------------------------------------

googleAccountClose?.addEventListener(
    "click",
    () => {

        Auth.closeGoogleAccountModal();
    }
);


// --------------------------------------------------
// GOOGLE ACCOUNT LOGOUT
// --------------------------------------------------

googleAccountLogout?.addEventListener(
    "click",
    async (event) => {

        event.preventDefault();
        event.stopPropagation();


        googleAccountLogout.disabled = true;

        googleAccountLogout.textContent =
            "Çıkış yapılıyor...";


        const result =
            await Auth.logout();


        googleAccountLogout.disabled = false;

        googleAccountLogout.textContent =
            "🚪 Çıkış Yap";


        if (!result.success) {

            alert(
                "Çıkış yapılamadı:\n" +
                result.error
            );

            return;
        }


        Auth.closeGoogleAccountModal();
    }
);

const googleAccountClose =
    document.getElementById(
        "google-account-close"
    );

const googleAccountLogout =
    document.getElementById(
        "google-account-logout"
    );

        // --------------------------------------------------
        // ACCOUNT BUTTON
        // --------------------------------------------------

        accountButton?.addEventListener(
            "click",
            async event => {

                event.preventDefault();
                event.stopImmediatePropagation();


                let user =
                    Auth.user;


                if (!user) {

                    user =
                        await Auth.getCurrentUser();
                }


                if (!user) {

                    Auth.openAuthModal();

                    return;
                }


                Auth.openAccountModal();
            },
            true
        );


        // --------------------------------------------------
        // ACCOUNT CLOSE
        // --------------------------------------------------

        accountClose?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();


                Auth.closeAccountModal();
            }
        );


        // --------------------------------------------------
        // LOGOUT
        // --------------------------------------------------

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
        // INITIAL UI
        // ==================================================

        await Auth.init();


        Auth.updateAccountUI();


        Auth.updateAccountModalUI();
    }
);
