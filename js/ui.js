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
// MOBILE MENU
// ==========================================================

const menuButton =
    document.getElementById("menu-button");

const mobileMenu =
    document.getElementById("mobile-menu");


// ==========================================================
// OPEN MOBILE MENU
// ==========================================================

function openMobileMenu() {

    if (!mobileMenu) return;

    mobileMenu.classList.remove("hidden");

    mobileMenu.hidden = false;

    mobileMenu.style.display = "block";

    console.log("🌸 Mobile Menu açıldı");

}


// ==========================================================
// CLOSE MOBILE MENU
// ==========================================================

function closeMobileMenu() {

    if (!mobileMenu) return;

    mobileMenu.classList.add("hidden");

    mobileMenu.hidden = true;

    mobileMenu.style.display = "none";

}


// ==========================================================
// TOGGLE MOBILE MENU
// ==========================================================

function toggleMobileMenu() {

    if (!mobileMenu) return;

    const isHidden =
        mobileMenu.classList.contains("hidden") ||
        mobileMenu.hidden === true;

    if (isHidden) {

        openMobileMenu();

    } else {

        closeMobileMenu();

    }

}


// ==========================================================
// MENU BUTTON
// ==========================================================

if (menuButton) {

    menuButton.addEventListener(
        "click",
        event => {

            event.preventDefault();
            event.stopPropagation();

            toggleMobileMenu();

        }
    );

}


// ==========================================================
// CLOSE WHEN CLICKING OUTSIDE
// ==========================================================

document.addEventListener(
    "click",
    event => {

        if (!mobileMenu) return;

        if (
            mobileMenu.classList.contains("hidden")
        ) {
            return;
        }

        if (
            mobileMenu.contains(event.target) ||
            menuButton?.contains(event.target)
        ) {
            return;
        }

        closeMobileMenu();

    }
);
