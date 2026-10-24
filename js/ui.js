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
    document.getElementById("header-settings-button")
];


// ==========================================================
// OPEN SETTINGS
// ==========================================================

function openSettings() {

    if (!settingsModal) return;

    settingsModal.classList.remove("hidden");
    settingsModal.classList.remove("closing");
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
        event => {

            event.preventDefault();
            event.stopPropagation();

            openSettings();

        }
    );

});


// ==========================================================
// SETTINGS MODAL CLOSE BUTTONS
// ==========================================================

document
    .querySelectorAll("#settings-modal .close-modal")
    .forEach(button => {

        button.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                closeSettings();

            }
        );

    });


// ==========================================================
// IMPORTANT
// ==========================================================
//
// ACCOUNT BUTONU BURADA YOK.
//
// Account işlemlerinin tamamı auth.js tarafından yönetiliyor.
//
// ui.js:
// ❌ auth-modal açmaz
// ❌ account-modal açmaz
// ❌ login ekranı açmaz
// ❌ logout yapmaz
//
// auth.js:
// ✅ Hesap butonunu yönetir
// ✅ Giriş yapılmamışsa auth-modal açar
// ✅ Giriş yapılmışsa account-modal açar
// ✅ Logout işlemini yönetir
//

// ==========================================================
// MENU (hamburger / sidebar drawer)
// ==========================================================
//
// The hamburger button, the sidebar drawer, its backdrop, swipe
// gestures and the global Esc handling live in js/sidebar.js.
// The old floating "mobile menu" dropdown was removed — every
// entry it had (new chat, memory, settings, about) is now in the
// sidebar itself.
