// ==========================================================
// LOTUS AI — UI
// ==========================================================


// ==========================================================
// SETTINGS MODAL
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
// SETTINGS MODAL CLOSE BUTTONS
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
// NOTE
// ==========================================================
//
// ACCOUNT SİSTEMİ BURADA YOK.
//
// Hesap butonu, giriş ekranı,
// Account Modal ve çıkış işlemleri
// tamamen auth.js tarafından yönetilir.
//
// ui.js yalnızca Settings UI'sini yönetir.
//
// ==========================================================
