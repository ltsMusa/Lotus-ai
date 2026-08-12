// ==========================================================
// LOTUS AI — UI
// ==========================================================

const settingsModal =
    document.getElementById("settings-modal");

const authModal =
    document.getElementById("auth-modal");


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


// Settings butonları

settingsButtons.forEach(button => {

    if (!button) return;

    button.addEventListener(
        "click",
        openSettings
    );

});


// ==========================================================
// SETTINGS MODAL CLOSE
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
// ACCOUNT
// ==========================================================

const accountButton =
    document.querySelector(
        '.settings-item[data-setting="account"]'
    );


if (accountButton) {

    accountButton.addEventListener(
        "click",
        () => {

            if (!authModal) return;

            authModal.classList.remove(
                "hidden"
            );

        }
    );

}
