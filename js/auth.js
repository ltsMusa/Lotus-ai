// ==========================================================
// LOTUS AI — AUTHENTICATION
// ==========================================================


// ==========================================================
// SUPABASE
// ==========================================================

const SUPABASE_URL =
    "https://ecveafyfgelsyamoheyn.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_qd7Eqg9Cz_9_fxqSlSFXxg_DLtUFVDb";


const supabase =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


// ==========================================================
// AUTH OBJECT
// ==========================================================

const Auth = {

    user: null,


    // ======================================================
    // UPDATE ACCOUNT BUTTON
    // ======================================================

    updateAccountUI() {

        const button =
            document.querySelector(
                '.settings-item[data-setting="account"]'
            );

        if (!button) return;


        const label =
            button.querySelector(
                ".settings-label"
            );

        if (!label) return;


        if (this.user) {

            label.innerHTML = `
                <strong>Hesabım</strong>
                <small>${this.user.email}</small>
            `;

        } else {

            label.innerHTML = `
                <strong>Hesap</strong>
                <small>Giriş yap ve hesabını yönet</small>
            `;
        }
    },


    // ======================================================
    // LOGIN MODAL — OPEN
    // ======================================================

    openAuthModal() {

        const modal =
            document.getElementById(
                "auth-modal"
            );

        if (!modal) return;


        modal.classList.remove("hidden");

        modal.hidden = false;

        modal.style.display = "";
    },


    // ======================================================
    // LOGIN MODAL — CLOSE
    // ======================================================

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


    // ======================================================
    // ACCOUNT MODAL — OPEN
    // ======================================================

    openAccountModal() {

        const modal =
            document.getElementById(
                "account-modal"
            );

        if (!modal) return;


        if (!this.user) {

            this.openAuthModal();

            return;
        }


        const email =
            this.user.email;


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
                email;
        }


        // Login ekranının açık kalmasını engelle

        this.closeAuthModal();


        // Account ekranını aç

        modal.classList.remove("hidden");

        modal.hidden = false;

        modal.style.display = "";
    },


    // ======================================================
    // ACCOUNT MODAL — CLOSE
    // ======================================================

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


    // ======================================================
    // GET SESSION
    // ======================================================

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


        return data.session;
    },


    // ======================================================
    // REGISTER
    // ======================================================

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


        this.user =
            data.user ?? null;


        this.updateAccountUI();


        return {

            success: true,

            user:
                data.user,

            session:
                data.session

        };
    },


    // ======================================================
    // LOGIN
    // ======================================================

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


        this.user =
            data.user;


        this.updateAccountUI();


        this.closeAuthModal();


        return {

            success: true,

            user:
                data.user,

            session:
                data.session

        };
    },


    // ======================================================
    // GOOGLE LOGIN
    // ======================================================

    async loginWithGoogle() {

        const {
            data,
            error
        } =
            await supabase.auth.signInWithOAuth({

                provider:
                    "google",

                options: {

                    redirectTo:
                        "https://lotus-ai-w16u-l3ai6rngb-lts-musa-s-projects.vercel.app/"

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


    // ======================================================
    // LOGOUT
    // ======================================================

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


        this.updateAccountUI();


        this.closeAccountModal();


        return {

            success: true

        };
    },


    // ======================================================
    // INIT
    // ======================================================

    async init() {

        console.log(
            "🌸 Lotus Auth başlatılıyor..."
        );


        const {
            data,
            error
        } =
            await supabase.auth.getSession();


        if (error) {

            console.error(
                "Oturum alınamadı:",
                error
            );

            return;
        }


        this.user =
            data.session?.user ?? null;


        this.updateAccountUI();


        if (this.user) {

            console.log(
                "🌸 Aktif kullanıcı:",
                this.user.email
            );

            this.closeAuthModal();

        } else {

            console.log(
                "🌸 Aktif kullanıcı yok."
            );
        }


        // ==================================================
        // AUTH STATE LISTENER
        // ==================================================

        supabase.auth.onAuthStateChange(
            (event, session) => {

                this.user =
                    session?.user ?? null;


                console.log(
                    "🌸 Auth:",
                    event
                );


                this.updateAccountUI();


                if (
                    event === "SIGNED_IN"
                ) {

                    this.closeAuthModal();

                }


                if (
                    event === "SIGNED_OUT"
                ) {

                    this.closeAuthModal();

                    this.closeAccountModal();

                    this.updateAccountUI();

                }

            }
        );
    }

};


// ==========================================================
// DOM READY
// ==========================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {


        // ==================================================
        // LOGIN ELEMENTS
        // ==================================================

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


        const loginPanel =
            document.getElementById(
                "login-panel"
            );


        const registerPanel =
            document.getElementById(
                "register-panel"
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


                const result =
                    await Auth.login(
                        email,
                        password
                    );


                loginButton.disabled =
                    false;


                loginButton.textContent =
                    "Giriş Yap";


                if (!result.success) {

                    alert(
                        "Giriş başarısız:\n" +
                        result.error
                    );

                    return;
                }


                console.log(
                    "🌸 Lotus'a giriş yapıldı."
                );
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


                const result =
                    await Auth.register(
                        email,
                        password
                    );


                registerButton.disabled =
                    false;


                registerButton.textContent =
                    "Hesap Oluştur";


                if (!result.success) {

                    alert(
                        "Kayıt başarısız:\n" +
                        result.error
                    );

                    return;
                }


                if (!result.session) {

                    alert(
                        "Hesabın oluşturuldu! " +
                        "E-posta adresini doğrulaman gerekebilir."
                    );

                } else {

                    Auth.closeAuthModal();

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


                const result =
                    await Auth.loginWithGoogle();


                if (!result.success) {

                    googleButton.disabled =
                        false;


                    googleButton.textContent =
                        "Google ile devam et";


                    alert(
                        "Google girişi başarısız:\n" +
                        result.error
                    );

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
        // CLOSE LOGIN
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

        const accountButton =
            document.querySelector(
                '.settings-item[data-setting="account"]'
            );


        accountButton?.addEventListener(
            "click",
            (event) => {

                event.preventDefault();

                event.stopPropagation();


                // ==========================================
                // EN ÖNEMLİ KISIM
                // ==========================================

                if (!Auth.user) {

                    Auth.openAuthModal();

                    return;
                }


                // ==========================================
                // KULLANICI GİRİŞ YAPMIŞ
                // ==========================================

                Auth.openAccountModal();

            }
        );


        // ==================================================
        // ACCOUNT CLOSE
        // ==================================================

        const accountClose =
            document.getElementById(
                "account-close"
            );


        accountClose?.addEventListener(
            "click",
            () => {

                Auth.closeAccountModal();

            }
        );


        // ==================================================
        // ACCOUNT LOGOUT
        // ==================================================

        const accountLogout =
            document.getElementById(
                "account-logout"
            );


        accountLogout?.addEventListener(
            "click",
            async () => {

                accountLogout.disabled =
                    true;


                accountLogout.textContent =
                    "Çıkış yapılıyor...";


                const result =
                    await Auth.logout();


                accountLogout.disabled =
                    false;


                accountLogout.textContent =
                    "🚪 Çıkış Yap";


                if (!result.success) {

                    alert(
                        "Çıkış yapılamadı:\n" +
                        result.error
                    );

                }

            }
        );


        // ==================================================
        // INITIAL UI
        // ==================================================

        Auth.updateAccountUI();

    }
);


// ==========================================================
// START
// ==========================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        Auth.init();

    }
);
