// ==========================================================
// LOTUS AI — UI
// ==========================================================


// ==========================================================
// ELEMENTS
// ==========================================================

const settingsModal =
    document.getElementById("settings-modal");


// ==========================================================
// SETTINGS BUTTONS
// ==========================================================

const settingsButtons = [
    document.getElementById("settings-button"),
    document.getElementById("header-settings-button"),
    document.getElementById("mobile-settings")
];


// ==========================================================
// OPEN SETTINGS
// ==========================================================

function openSettings() {

    if (!settingsModal) return;

    settingsModal.classList.remove("hidden");
}


// ==========================================================
// CLOSE SETTINGS
// ==========================================================

function closeSettings() {

    if (!settingsModal) return;

    settingsModal.classList.add("closing");

    setTimeout(() => {

        settingsModal.classList.add("hidden");
        settingsModal.classList.remove("closing");

    }, 300);
}


// ==========================================================
// SETTINGS BUTTON EVENTS
// ==========================================================

settingsButtons.forEach(button => {

    if (!button) return;

    button.addEventListener(
        "click",
        openSettings
    );

});


// ==========================================================
// SETTINGS CLOSE BUTTONS
// ==========================================================

document
    .querySelectorAll(".close-modal")
    .forEach(button => {

        button.addEventListener(
            "click",
            closeSettings
        );

    });


// ==========================================================
// BACKDROP CLOSE
// ==========================================================

if (settingsModal) {

    settingsModal.addEventListener(
        "click",
        event => {

            if (
                event.target === settingsModal
            ) {

                closeSettings();

            }

        }
    );

}


// ==========================================================
// ESCAPE KEY
// ==========================================================

document.addEventListener(
    "keydown",
    event => {

        if (event.key !== "Escape") return;


        // Settings açıksa kapat

        if (
            settingsModal &&
            !settingsModal.classList.contains("hidden")
        ) {

            closeSettings();

        }


        // Account modal açıksa kapat

        const accountModal =
            document.getElementById(
                "account-modal"
            );

        if (
            accountModal &&
            !accountModal.classList.contains("hidden")
        ) {

            accountModal.classList.add(
                "hidden"
            );

        }


        // Auth modal açıksa kapat

        const authModal =
            document.getElementById(
                "auth-modal"
            );

        if (
            authModal &&
            !authModal.classList.contains("hidden")
        ) {

            authModal.classList.add(
                "hidden"
            );

        }

    }
);


// ==========================================================
// ACCOUNT
//
// ÖNEMLİ:
// Account butonunun click olayını burada TANIMLAMIYORUZ.
//
// auth.js bu işi yönetiyor.
//
// Böylece:
// Hesap → giriş yoksa Auth Modal
// Hesap → giriş varsa Account Modal
//
// ui.js artık auth.js ile çakışmayacak.
// ==========================================================


// ==========================================================
// ACCOUNT MODAL BACKDROP
// ==========================================================

const accountModal =
    document.getElementById(
        "account-modal"
    );


if (accountModal) {

    accountModal.addEventListener(
        "click",
        event => {

            if (
                event.target === accountModal
            ) {

                accountModal.classList.add(
                    "hidden"
                );

            }

        }
    );

}


// ==========================================================
// AUTH MODAL BACKDROP
// ==========================================================

const authModal =
    document.getElementById(
        "auth-modal"
    );


if (authModal) {

    authModal.addEventListener(
        "click",
        event => {

            if (
                event.target === authModal
            ) {

                authModal.classList.add(
                    "hidden"
                );

            }

        }
    );

}


// ==========================================================
// END
// ==========================================================

console.log(
    "Lotus UI başlatıldı."
);
