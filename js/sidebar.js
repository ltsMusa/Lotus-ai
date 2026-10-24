/**
 * ==========================================================
 * Lotus AI - Sidebar / Drawer
 * ==========================================================
 * The sidebar (chat history, search, shortcuts, account) was
 * fully built in the markup but hidden with `display: none`
 * — so saved conversations existed in storage with no way to
 * reach them from the UI. This module makes it real:
 *
 *  - phones/tablets: a slide-in drawer (hamburger, edge swipe,
 *    backdrop tap, Esc)
 *  - wide screens: a persistent column the hamburger collapses
 *  - per-chat menu (⋯ button, right click, long press):
 *    rename / pin / export / delete
 *  - account chip, shortcuts (Ctrl/⌘+K) and one global Esc
 *    handler that closes whatever is on top
 * ==========================================================
 */

import { supabase, Auth } from "./auth.js";
import Storage from "./storage.js";
import { showToast, showPrompt, showConfirm } from "./toast.js";
import { saveTextFile } from "./clipboard.js";
import { icon } from "./utils.js";

const DESKTOP = window.matchMedia("(min-width: 1024px)");

const COLLAPSE_KEY = "lotus_sidebar_collapsed";

const $ = id => document.getElementById(id);

function safeGet(key) {

    try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {

    try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// ----------------------------------------------------------
// OPEN / CLOSE
// ----------------------------------------------------------

function isOpen() {

    return DESKTOP.matches
        ? !document.body.classList.contains("sidebar-collapsed")
        : document.body.classList.contains("sidebar-open");
}

function applyState() {

    const open = isOpen();

    const sidebar = $("sidebar");

    if (sidebar) {

        sidebar.setAttribute("aria-hidden", String(!open));

        if ("inert" in sidebar) sidebar.inert = !open;
    }

    const menuButton = $("menu-button");

    if (menuButton) {

        menuButton.setAttribute("aria-expanded", String(open));
        menuButton.setAttribute("aria-label", open ? "Menüyü kapat" : "Menüyü aç");
        menuButton.classList.toggle("is-open", open);
    }
}

export function openSidebar() {

    if (DESKTOP.matches) {

        document.body.classList.remove("sidebar-collapsed");

        safeSet(COLLAPSE_KEY, "0");

    } else {

        document.body.classList.add("sidebar-open");
    }

    applyState();
}

export function closeSidebar() {

    if (DESKTOP.matches) {

        document.body.classList.add("sidebar-collapsed");

        safeSet(COLLAPSE_KEY, "1");

    } else {

        document.body.classList.remove("sidebar-open");
    }

    applyState();
}

export function toggleSidebar() {

    if (isOpen()) closeSidebar();
    else openSidebar();
}

/** On phones the drawer covers the chat, so any action closes it. */
function closeIfDrawer() {

    if (!DESKTOP.matches && isOpen()) closeSidebar();
}

// ----------------------------------------------------------
// CHAT ITEM MENU (rename / pin / export / delete)
// ----------------------------------------------------------

let menuTarget = null;

function hideMenu() {

    $("context-menu")?.classList.add("hidden");

    menuTarget = null;
}

function showMenu(conversationId, x, y) {

    const menu = $("context-menu");

    if (!menu) return;

    menuTarget = conversationId;

    const pinLabel = menu.querySelector("#pin-chat b");

    if (pinLabel) pinLabel.textContent = Storage.isPinned(conversationId) ? "Sabitlemeyi kaldır" : "Sabitle";

    menu.classList.remove("hidden");

    const { width, height } = menu.getBoundingClientRect();

    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.querySelector("button")?.focus({ preventScroll: true });
}

function titleOf(conversationId) {

    const item = document.querySelector(`.chat-list-item[data-id="${CSS.escape(conversationId)}"] .chat-list-item-title`);

    return item?.textContent?.trim() || "";
}

async function runMenuAction(action) {

    const id = menuTarget;

    hideMenu();

    if (!id) return;

    if (action === "rename") {

        const next = await showPrompt("Sohbetin yeni adı:", "Sohbet adı", titleOf(id));

        if (next) {

            const ok = await Storage.renameConversation(id, next);

            if (!ok) showToast("Ad değiştirilemedi. Bağlantını kontrol et.", "error");
        }

    } else if (action === "pin") {

        const pinned = await Storage.togglePin(id);

        showToast(pinned ? "Sohbet sabitlendi" : "Sabitleme kaldırıldı", "success", 1800);

    } else if (action === "export") {

        try {

            const { filename, markdown } = await Storage.exportMarkdown(id);

            const mode = await saveTextFile(filename, markdown);

            showToast(
                mode === "download" ? `${filename} indirildi` :
                mode === "share" ? "Paylaşım menüsü açıldı" :
                "Sohbet panoya kopyalandı (bu ortamda dosya indirilemiyor)",
                "success"
            );

        } catch (error) {

            console.warn("Dışa aktarma başarısız:", error);

            showToast("Sohbet dışa aktarılamadı.", "error");
        }

    } else if (action === "delete") {

        const confirmed = await showConfirm("Bu sohbeti silmek istediğine emin misin?");

        if (!confirmed) return;

        document.querySelector(`.chat-list-item[data-id="${CSS.escape(id)}"]`)?.classList.add("removing");

        setTimeout(() => Storage.deleteConversation(id), 170);
    }
}

function bindChatListMenu() {

    const list = $("chat-list");

    if (!list) return;

    // ⋯ button
    list.addEventListener("click", event => {

        const button = event.target.closest(".chat-list-item-menu");

        if (!button) return;

        event.stopPropagation();

        const rect = button.getBoundingClientRect();

        showMenu(button.dataset.id, rect.right - 6, rect.bottom + 4);
    });

    // right click
    list.addEventListener("contextmenu", event => {

        const item = event.target.closest(".chat-list-item");

        if (!item) return;

        event.preventDefault();

        showMenu(item.dataset.id, event.clientX, event.clientY);
    });

    // long press (touch)
    let pressTimer = null;
    let pressStart = null;
    let longPressed = false;

    const cancelPress = () => {

        clearTimeout(pressTimer);

        pressTimer = null;
    };

    list.addEventListener("touchstart", event => {

        const item = event.target.closest(".chat-list-item");

        if (!item || event.target.closest(".chat-list-item-menu")) return;

        const touch = event.touches[0];

        pressStart = { x: touch.clientX, y: touch.clientY };

        longPressed = false;

        pressTimer = setTimeout(() => {

            longPressed = true;

            navigator.vibrate?.(12);

            showMenu(item.dataset.id, pressStart.x, pressStart.y);

        }, 520);

    }, { passive: true });

    list.addEventListener("touchmove", event => {

        if (!pressTimer) return;

        const touch = event.touches[0];

        if (Math.abs(touch.clientX - pressStart.x) > 10 || Math.abs(touch.clientY - pressStart.y) > 10) cancelPress();

    }, { passive: true });

    list.addEventListener("touchend", cancelPress, { passive: true });
    list.addEventListener("touchcancel", cancelPress, { passive: true });

    // The finger lift after a long press fires a click on the item —
    // swallow it so the chat doesn't open under the menu.
    list.addEventListener("click", event => {

        if (!longPressed) return;

        longPressed = false;

        event.stopPropagation();
        event.preventDefault();

    }, true);

    // menu entries
    const menu = $("context-menu");

    menu?.querySelector("#rename-chat")?.addEventListener("click", () => runMenuAction("rename"));
    menu?.querySelector("#pin-chat")?.addEventListener("click", () => runMenuAction("pin"));
    menu?.querySelector("#export-chat")?.addEventListener("click", () => runMenuAction("export"));
    menu?.querySelector("#delete-chat")?.addEventListener("click", () => runMenuAction("delete"));

    // dismiss
    document.addEventListener("click", event => {

        if (menu && !menu.classList.contains("hidden") && !menu.contains(event.target)) hideMenu();
    });

    window.addEventListener("resize", hideMenu);

    list.addEventListener("scroll", hideMenu, { passive: true });
}

// ----------------------------------------------------------
// ACCOUNT CHIP
// ----------------------------------------------------------

function renderAccount(user) {

    const avatar = $("sidebar-avatar");
    const name = $("sidebar-account-name");
    const sub = $("sidebar-account-sub");

    if (!avatar || !name || !sub) return;

    if (user) {

        const email = user.email || "";

        const display =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            email.split("@")[0] ||
            "Hesabım";

        avatar.textContent = display.charAt(0).toUpperCase();
        avatar.classList.add("signed-in");

        name.textContent = display;
        sub.textContent = email || "Giriş yapıldı";

    } else {

        avatar.innerHTML = icon("user");
        avatar.classList.remove("signed-in");

        name.textContent = "Misafir";
        sub.textContent = "Giriş yap · sohbetlerin her cihazda olsun";
    }
}

function bindAccount() {

    $("sidebar-account")?.addEventListener("click", () => {

        // auth.js owns every account flow (login modal when signed out,
        // account modal when signed in) via this one settings button.
        document.querySelector('.settings-item[data-setting="account"]')?.click();

        closeIfDrawer();
    });

    try {

        supabase?.auth?.onAuthStateChange?.((_event, session) => renderAccount(session?.user ?? null));

    } catch (error) {

        console.warn("Hesap durumu dinlenemedi:", error);
    }

    Promise.resolve(Auth.getCurrentUser?.())
        .then(user => renderAccount(user ?? null))
        .catch(() => renderAccount(null));
}

// ----------------------------------------------------------
// ESC / SHORTCUTS
// ----------------------------------------------------------

const ESC_CLOSE_ORDER = ["image-viewer", "context-menu", "gallery-modal", "tools-modal", "memory-modal", "about-modal"];

const ACCOUNT_CLOSE = [
    ["auth-modal", "auth-close"],
    ["account-modal", "account-close"],
    ["google-account-modal", "google-account-close"]
];

function handleEscape() {

    if (document.querySelector(".toast-confirm-overlay")) return false; // it handles its own Esc

    for (const id of ESC_CLOSE_ORDER) {

        const element = $(id);

        if (element && !element.classList.contains("hidden")) {

            element.classList.add("hidden");

            if (id === "context-menu") menuTarget = null;

            return true;
        }
    }

    const settings = $("settings-modal");

    if (settings && !settings.classList.contains("hidden")) {

        settings.querySelector(".close-modal")?.click();

        return true;
    }

    for (const [modalId, buttonId] of ACCOUNT_CLOSE) {

        const modal = $(modalId);

        if (modal && !modal.classList.contains("hidden")) {

            $(buttonId)?.click();

            return true;
        }
    }

    if (!DESKTOP.matches && isOpen()) {

        closeSidebar();

        return true;
    }

    return false;
}

function bindKeyboard() {

    document.addEventListener("keydown", event => {

        if (event.key === "Escape") {

            if (handleEscape()) event.preventDefault();

            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {

            event.preventDefault();

            openSidebar();

            const search = $("search-chat");

            // Wait a frame so the drawer is no longer inert.
            requestAnimationFrame(() => search?.focus());
        }
    });
}

// ----------------------------------------------------------
// SWIPE (phones)
// ----------------------------------------------------------

function bindSwipe() {

    let start = null;

    document.addEventListener("touchstart", event => {

        if (DESKTOP.matches || event.touches.length !== 1) return;

        const touch = event.touches[0];

        const open = isOpen();

        // Opening starts at the left edge; closing can start anywhere.
        if (!open && touch.clientX > 28) {

            start = null;

            return;
        }

        start = { x: touch.clientX, y: touch.clientY, open };

    }, { passive: true });

    document.addEventListener("touchend", event => {

        if (!start) return;

        const touch = event.changedTouches[0];

        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;

        if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {

            if (!start.open && dx > 0) openSidebar();
            else if (start.open && dx < 0) closeSidebar();
        }

        start = null;

    }, { passive: true });
}

// ----------------------------------------------------------
// WIRING
// ----------------------------------------------------------

function init() {

    if (DESKTOP.matches && safeGet(COLLAPSE_KEY) === "1") {

        document.body.classList.add("sidebar-collapsed");
    }

    $("menu-button")?.addEventListener("click", event => {

        event.preventDefault();
        event.stopPropagation();

        toggleSidebar();
    });

    $("sidebar-close")?.addEventListener("click", closeSidebar);

    $("sidebar-backdrop")?.addEventListener("click", closeIfDrawer);

    DESKTOP.addEventListener?.("change", () => {

        document.body.classList.remove("sidebar-open");

        applyState();
    });

    // Chat selected / new chat → the drawer has done its job.
    document.addEventListener("lotus:conversation-changed", closeIfDrawer);

    // Shortcut buttons
    $("nav-chats")?.addEventListener("click", () => {

        const search = $("search-chat");

        $("chat-list")?.scrollTo?.({ top: 0, behavior: "smooth" });

        search?.focus();
    });

    $("nav-gallery")?.addEventListener("click", () => {

        document.dispatchEvent(new CustomEvent("lotus:open-gallery"));

        closeIfDrawer();
    });

    $("nav-tools")?.addEventListener("click", () => {

        document.dispatchEvent(new CustomEvent("lotus:open-tools"));

        closeIfDrawer();
    });

    ["memory-button", "settings-button", "about-button"].forEach(id => {

        $(id)?.addEventListener("click", closeIfDrawer);
    });

    // Clicking the dimmed area of any lotus modal closes it.
    document.querySelectorAll(".lotus-modal").forEach(modal => {

        modal.addEventListener("click", event => {

            if (event.target === modal) modal.classList.add("hidden");
        });
    });

    // Generic close buttons for the modals this file doesn't own.
    ["gallery-modal", "tools-modal"].forEach(id => {

        $(id)?.querySelectorAll(".close-modal").forEach(button => {

            button.addEventListener("click", () => $(id).classList.add("hidden"));
        });
    });

    bindChatListMenu();
    bindAccount();
    bindKeyboard();
    bindSwipe();

    applyState();
}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", init);

} else {

    init();
}
