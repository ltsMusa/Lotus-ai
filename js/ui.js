// ==========================================================
// LOTUS AI — UI
// ==========================================================

const settingsModal = document.getElementById("settings-modal");

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

    settingsModal.classList.add("hidden");
}


// Settings butonları
settingsButtons.forEach(button => {
    if (!button) return;

    button.addEventListener("click", openSettings);
});


// Modal kapatma butonu
document.querySelectorAll(".close-modal").forEach(button => {
    button.addEventListener("click", () => {

        if (settingsModal) {
            settingsModal.classList.add("hidden");
        }

    });
});
