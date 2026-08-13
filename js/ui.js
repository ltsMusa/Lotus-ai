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

    settingsModal.hidden = false;
}


// ==========================================================
// CLOSE SETTINGS
// ==========================================================

function closeSettings() {

    if (!settingsModal) return;

    settingsModal.classList.add("hidden");

    settingsModal.hidden = true;
}


// ==========================================================
// SETTINGS BUTTON EVENTS
// ==========================================================

settingsButtons.forEach(button => {

    if (!button) return;

    button.addEventListener(
        "click",
        event => {

            event.preventDefault();

            openSettings();
        }
    );

});


// ==========================================================
// CLOSE MODAL BUTTONS
// ==========================================================

document
    .querySelectorAll("#settings-modal .close-modal")
    .forEach(button => {

        button.addEventListener(
            "click",
            event => {

                event.preventDefault();

                closeSettings();
            }
        );

    });


// ==========================================================
// ESC KEY
// ==========================================================

document.addEventListener(
    "keydown",
    event => {

        if (event.key !== "Escape") return;

        closeSettings();

        const accountModal =
            document.getElementById("account-modal");

        if (accountModal) {

            accountModal.classList.add("hidden");
        }

        const authModal =
            document.getElementById("auth-modal");

        if (authModal) {

            authModal.classList.add("hidden");
        }

    }
);


// ==========================================================
// MODAL BACKDROP CLOSE
// ==========================================================

[settingsModal].forEach(modal => {

    if (!modal) return;

    modal.addEventListener(
        "click",
        event => {

            if (event.target !== modal) return;

            closeSettings();
        }
    );

});


// ==========================================================
// NOTE
// ==========================================================
//
// ACCOUNT BUTONU BURADA YOK.
//
// Account işlemlerini auth.js yönetiyor.
//
// Böylece:
//
// ui.js      → Settings UI
// auth.js    → Login / Register / Account / Logout
//
// İki dosya aynı butona event bağlamıyor.
// ==========================================================
