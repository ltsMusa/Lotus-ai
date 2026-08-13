// ==========================================================
// LOTUS AI — AUTHENTICATION
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
// AUTH
// ==========================================================

const Auth = {

    user: null,


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
                <small>${this.user.email}</small>
            `;

        } else {

            label.innerHTML = `
                <strong>Hesap</strong>
                <small>Giriş yap ve hesabını yönet</small>
            `;
        }
    },


    // ------------------------------------------------------
    // OPEN AUTH MODAL
    // ------------------------------------------------------

    openAuthModal() {

        const authModal =
            document.getElementById(
                "auth-modal"
            );

        if (!authModal) return;


        authModal.classList.remove(
            "hidden"
        );

        authModal.hidden = false;

        authModal.style.display = "";
    },


    // ------------------------------------------------------
    // CLOSE AUTH MODAL
    // ------------------------------------------------------

    closeAuthModal() {

        const authModal =
            document.getElementById(
                "auth-modal"
            );

        if (!authModal) return;


        authModal.classList.add(
            "hidden"
        );

        authModal.hidden = true;

        authModal.style.display = "none";
    },


    // ------------------------------------------------------
    // INIT
    // ------------------------------------------------------

    async init() {

        console.log(
            "Lotus Auth başlatıldı."
        );


        const {
            data,
            error
        } = await supabase.auth.getSession();


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


        // --------------------------------------------------
        // EXISTING SESSION
        // --------------------------------------------------

        if (this.user) {

            console.log(
                "Aktif kullanıcı:",
                this.user.email
            );

            // Kullanıcı zaten giriş yapmışsa
            // login ekranını kapat.

            this.closeAuthModal();

        } else {

            console.log(
                "Aktif oturum yok."
            );
        }


        // --------------------------------------------------
        // AUTH STATE CHANGES
        // --------------------------------------------------

        supabase.auth.onAuthStateChange(
            (event, session) => {

                this.user =
                    session?.user ?? null;


                console.log(
                    "Auth durumu:",
                    event
                );


                this.updateAccountUI();


                // Kullanıcı giriş yaptıysa
                // login ekranını kapat.

                if (
                    event === "SIGNED_IN" &&
                    this.user
                ) {

                    console.log(
                        "Giriş başarılı:",
                        this.user.email
                    );

                    this.closeAuthModal();
                }


                // Kullanıcı çıkış yaptıysa
                // hesap arayüzünü güncelle.

                if (
                    event === "SIGNED_OUT"
                ) {

                    console.log(
                        "Oturum kapatıldı."
                    );

                    this.updateAccountUI();
                }
            }
        );
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
        } = await supabase.auth.signUp({
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
                error: error.message
            };
        }


        this.user =
            data.user;


        this.updateAccountUI();


        return {
            success: true,
            user: data.user,
            session: data.session
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
        } = await supabase.auth.signInWithPassword({
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
                error: error.message
            };
        }


        this.user =
            data.user;


        this.updateAccountUI();


        // Login başarılı.
        // Modalı burada da kapatıyoruz.

        this.closeAuthModal();


        return {
            success: true,
            user: data.user,
            session: data.session
        };
    },


    // ------------------------------------------------------
    // GOOGLE LOGIN
    // ------------------------------------------------------

    async loginWithGoogle() {

        const {
            data,
            error
        } = await supabase.auth.signInWithOAuth({

            provider: "google",

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
                error: error.message
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
        } = await supabase.auth.signOut();


        if (error) {

            console.error(
                "Çıkış hatası:",
                error
            );

            return {
                success: false,
                error: error.message
            };
        }


        this.user = null;


        this.updateAccountUI();


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
        } = await supabase.auth.getUser();


        if (error) {

            console.error(
                "Kullanıcı alınamadı:",
                error
            );

            return null;
        }


        this.user =
            data.user;


        this.updateAccountUI();


        return data.user;
    },
    
// ------------------------------------------------------
// GET CURRENT USER
// ------------------------------------------------------

async getCurrentUser() {

    const {
        data,
        error
    } = await supabase.auth.getUser();


    if (error) {

        console.error(
            "Güncel kullanıcı alınamadı:",
            error
        );

        return null;
    }


    this.user =
        data.user ?? null;


    this.updateAccountUI();


    return this.user;
},

    // ------------------------------------------------------
    // GET SESSION
    // ------------------------------------------------------

    async getSession() {

        const {
            data,
            error
        } = await supabase.auth.getSession();


        if (error) {

            console.error(
                "Session alınamadı:",
                error
            );

            return null;
        }


        return data.session;
    }

};


// ==========================================================
// UI
// ==========================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {


        // --------------------------------------------------
        // ELEMENTS
        // --------------------------------------------------

        const authModal =
            document.getElementById(
                "auth-modal"
            );


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


        // --------------------------------------------------
        // LOGIN
        // --------------------------------------------------

        loginButton?.addEventListener(
            "click",
            async () => {

                const email =
                    document.getElementById(
                        "login-email"
                    )?.value.trim();


                const password =
                    document.getElementById(
                        "login-password"
                    )?.value;


                if (
                    !email ||
                    !password
                ) {

                    alert(
                        "E-posta ve şifre gerekli."
                    );

                    return;
                }


                loginButton.disabled = true;

                loginButton.textContent =
                    "Giriş yapılıyor...";


                const result =
                    await Auth.login(
                        email,
                        password
                    );


                loginButton.disabled = false;

                loginButton.textContent =
                    "Giriş Yap";


                if (!result.success) {

                    alert(
                        "Giriş başarısız:\n" +
                        result.error
                    );

                    return;
                }


                // Başarılı giriş.
                // Modal kesin olarak kapanır.

                Auth.closeAuthModal();


                console.log(
                    "Lotus'a giriş yapıldı."
                );
            }
        );


        // --------------------------------------------------
        // REGISTER
        // --------------------------------------------------

        registerButton?.addEventListener(
            "click",
            async () => {

                const email =
                    document.getElementById(
                        "register-email"
                    )?.value.trim();


                const password =
                    document.getElementById(
                        "register-password"
                    )?.value;


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


                registerButton.disabled = true;

                registerButton.textContent =
                    "Hesap oluşturuluyor...";


                const result =
                    await Auth.register(
                        email,
                        password
                    );


                registerButton.disabled = false;

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


                console.log(
                    "Lotus hesabı oluşturuldu."
                );
            }
        );


        // --------------------------------------------------
        // GOOGLE
        // --------------------------------------------------

        googleButton?.addEventListener(
            "click",
            async () => {

                googleButton.disabled = true;

                googleButton.textContent =
                    "Google açılıyor...";


                const result =
                    await Auth.loginWithGoogle();


                if (!result.success) {

                    googleButton.disabled = false;

                    googleButton.textContent =
                        "Google ile devam et";


                    alert(
                        "Google girişi başarısız:\n" +
                        result.error
                    );
                }
            }
        );


        // --------------------------------------------------
        // SHOW REGISTER
        // --------------------------------------------------

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


        // --------------------------------------------------
        // SHOW LOGIN
        // --------------------------------------------------

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


        // --------------------------------------------------
        // CLOSE
        // --------------------------------------------------

        authClose?.addEventListener(
            "click",
            () => {

                Auth.closeAuthModal();
            }
        );

// --------------------------------------------------
// ACCOUNT
// --------------------------------------------------

const accountButton =
    document.querySelector(
        '.settings-item[data-setting="account"]'
    );

const accountModal =
    document.getElementById(
        "account-modal"
    );

const accountClose =
    document.getElementById(
        "account-close"
    );

const accountLogout =
    document.getElementById(
        "account-logout"
    );

const accountEmail =
    document.getElementById(
        "account-email"
    );

const accountEmailDetail =
    document.getElementById(
        "account-email-detail"
    );


// Hesap butonu

accountButton?.addEventListener(
    "click",
    async (event) => {

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();


        // Supabase'den güncel kullanıcıyı kontrol et

        const user =
            await Auth.getCurrentUser();
        
        if (!user) {
    alert("DEBUG: Kullanıcı bulunamadı.\nAuth.user: " + Auth.user);
        }
        
console.log("Auth.user:", Auth.user);
console.log("Current user:", user);

        // Giriş yapılmamışsa
        // login ekranını aç.

        if (!user) {

            Auth.openAuthModal();

            return;
        }


        // Giriş yapılmışsa
        // hesap menüsünü aç.

        if (accountEmail) {

            accountEmail.textContent =
                user.email;
        }


        if (accountEmailDetail) {

            accountEmailDetail.textContent =
                user.email;
        }


        accountModal?.classList.remove(
            "hidden"
        );
    },
    true
);

// Hesap menüsünü kapat

accountClose?.addEventListener(
    "click",
    () => {

        accountModal?.classList.add(
            "hidden"
        );
    }
);


// Çıkış yap

accountLogout?.addEventListener(
    "click",
    async () => {

        accountLogout.disabled = true;

        accountLogout.textContent =
            "Çıkış yapılıyor...";


        const result =
            await Auth.logout();


        accountLogout.disabled = false;

        accountLogout.textContent =
            "🚪 Çıkış Yap";


        if (!result.success) {

            alert(
                "Çıkış yapılamadı:\n" +
                result.error
            );

            return;
        }


        accountModal?.classList.add(
            "hidden"
        );


        console.log(
            "Lotus hesabından çıkış yapıldı."
        );
    }
);

        // --------------------------------------------------
        // INITIAL UI
        // --------------------------------------------------

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
