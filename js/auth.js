// ==========================================================
// LOTUS AI — AUTHENTICATION
// ==========================================================

const SUPABASE_URL = "https://ecveafyfgelsyamoheyn.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_qd7Eqg9Cz_9_fxqSlSFXxg_DLtUFVDb";

const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);


// ==========================================================
// AUTH
// ==========================================================

const Auth = {

    user: null,


    // ------------------------------------------------------
    // INIT
    // ------------------------------------------------------

    async init() {

        console.log("Lotus Auth başlatıldı.");

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


        this.user = data.session?.user ?? null;


        if (this.user) {

            console.log(
                "Aktif kullanıcı:",
                this.user.email
            );

        } else {

            console.log(
                "Aktif oturum yok."
            );
        }


        // Auth değişikliklerini dinle

        supabase.auth.onAuthStateChange(
            (event, session) => {

                this.user =
                    session?.user ?? null;


                console.log(
                    "Auth durumu:",
                    event
                );


                if (this.user) {

                    console.log(
                        "Kullanıcı:",
                        this.user.email
                    );

                }

            }
        );
    },


    // ------------------------------------------------------
    // REGISTER
    // ------------------------------------------------------

    async register(email, password) {

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


        this.user = data.user;


        return {
            success: true,
            user: data.user,
            session: data.session
        };
    },


    // ------------------------------------------------------
    // LOGIN
    // ------------------------------------------------------

    async login(email, password) {

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


        this.user = data.user;


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
                    window.location.origin
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


        this.user = data.user;

        return data.user;
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
                    ).value.trim();


                const password =
                    document.getElementById(
                        "login-password"
                    ).value;


                if (!email || !password) {

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


                authModal?.classList.add(
                    "hidden"
                );


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
                    ).value.trim();


                const password =
                    document.getElementById(
                        "register-password"
                    ).value;


                if (!email || !password) {

                    alert(
                        "E-posta ve şifre gerekli."
                    );

                    return;
                }


                if (password.length < 6) {

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

                    authModal?.classList.add(
                        "hidden"
                    );
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

                authModal?.classList.add(
                    "hidden"
                );
            }
        );

    }
);


// ==========================================================
// START
// ==========================================================

Auth.init();
