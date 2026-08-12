// ==========================================================
// LOTUS AI — AUTHENTICATION
// ==========================================================

const SUPABASE_URL = "https://ecveafyfgelsyamoheyn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qd7Eqg9Cz_9_fxqSlSFXxg_DLtUFVDb";

const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const Auth = {

    user: null,

    // ------------------------------------------------------
    // INIT
    // ------------------------------------------------------

    async init() {
        console.log("Lotus Auth başlatıldı.");

        const {
            data: { session },
            error
        } = await supabase.auth.getSession();

        if (error) {
            console.error("Oturum alınamadı:", error);
            return;
        }

        this.user = session?.user ?? null;

        console.log(
            this.user
                ? "Kullanıcı oturumu bulundu."
                : "Aktif oturum yok."
        );

        // Auth değişikliklerini dinle
        supabase.auth.onAuthStateChange((event, session) => {

            this.user = session?.user ?? null;

            console.log("Auth durumu:", event);

            if (this.user) {
                console.log("Giriş yapan kullanıcı:", this.user.email);
            }
        });
    },

    // ------------------------------------------------------
    // REGISTER
    // ------------------------------------------------------

    async register(email, password) {

        try {

            const {
                data,
                error
            } = await supabase.auth.signUp({
                email,
                password
            });

            if (error) {
                console.error("Kayıt hatası:", error);
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

        } catch (error) {

            console.error("Beklenmeyen kayıt hatası:", error);

            return {
                success: false,
                error: error.message
            };
        }
    },

    // ------------------------------------------------------
    // LOGIN
    // ------------------------------------------------------

    async login(email, password) {

        try {

            const {
                data,
                error
            } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                console.error("Giriş hatası:", error);

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

        } catch (error) {

            console.error("Beklenmeyen giriş hatası:", error);

            return {
                success: false,
                error: error.message
            };
        }
    },

    // ------------------------------------------------------
    // GOOGLE LOGIN
    // ------------------------------------------------------

    async loginWithGoogle() {

        try {

            const {
                data,
                error
            } = await supabase.auth.signInWithOAuth({
                provider: "google",

                options: {
                    redirectTo: window.location.origin
                }
            });

            if (error) {

                console.error("Google giriş hatası:", error);

                return {
                    success: false,
                    error: error.message
                };
            }

            return {
                success: true,
                data
            };

        } catch (error) {

            console.error(
                "Beklenmeyen Google giriş hatası:",
                error
            );

            return {
                success: false,
                error: error.message
            };
        }
    },

    // ------------------------------------------------------
    // LOGOUT
    // ------------------------------------------------------

    async logout() {

        try {

            const { error } = await supabase.auth.signOut();

            if (error) {

                console.error("Çıkış hatası:", error);

                return {
                    success: false,
                    error: error.message
                };
            }

            this.user = null;

            return {
                success: true
            };

        } catch (error) {

            console.error("Beklenmeyen çıkış hatası:", error);

            return {
                success: false,
                error: error.message
            };
        }
    },

    // ------------------------------------------------------
    // CURRENT USER
    // ------------------------------------------------------

    async getUser() {

        const {
            data,
            error
        } = await supabase.auth.getUser();

        if (error) {
            console.error("Kullanıcı alınamadı:", error);
            return null;
        }

        this.user = data.user;

        return data.user;
    },

    // ------------------------------------------------------
    // SESSION
    // ------------------------------------------------------

    async getSession() {

        const {
            data,
            error
        } = await supabase.auth.getSession();

        if (error) {
            console.error("Session alınamadı:", error);
            return null;
        }

        return data.session;
    }

};

// Lotus Auth'u başlat
Auth.init();
