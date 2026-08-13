// ==========================================================
// LOTUS AI — UI
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


function openSettings() {

    if (!settingsModal) return;

    settingsModal.classList.remove("hidden");
}


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
// SETTINGS CLOSE
// ==========================================================

document
    .querySelectorAll(".close-modal")
    .forEach(button => {

        button.addEventListener(
            "click",
            closeSettings
        );

    });
