/**
 * ==========================================================
 * Lotus AI - Composer polish
 * ==========================================================
 * Small behaviours around the message box:
 *  - the textarea grows with what you type (up to a limit) and
 *    shrinks back after sending
 *  - #composer gets `has-content` / `is-multiline` classes so the
 *    CSS can light the send button only when there is something
 *    to send, and keep the buttons bottom-aligned on long text
 *  - time-of-day greeting on the welcome screen
 *  - "/" jumps to the message box from anywhere
 * ==========================================================
 */

import { hasAttachment } from "./attachments.js";

const $ = id => document.getElementById(id);

function greeting() {

    const hour = new Date().getHours();

    if (hour < 5) return "İyi geceler";
    if (hour < 12) return "Günaydın";
    if (hour < 18) return "İyi günler";

    return "İyi akşamlar";
}

function init() {

    const input = $("message-input");
    const composer = $("composer");

    if (!input || !composer) return;

    const refresh = () => {

        input.style.height = "auto";

        const max = parseFloat(getComputedStyle(input).maxHeight) || 140;

        const natural = input.scrollHeight;

        input.style.height = `${Math.min(natural, max)}px`;

        composer.classList.toggle("is-multiline", natural > 60);
        composer.classList.toggle("has-content", input.value.trim().length > 0 || hasAttachment());
    };

    input.addEventListener("input", refresh);

    // chat.js's clearInput() dispatches "input" too; attachments.js
    // announces chip changes so an image alone also lights up send.
    document.addEventListener("lotus:attachments-changed", refresh);

    window.addEventListener("resize", refresh);

    refresh();

    // Height of everything under the chat (attachment chips + composer +
    // note), published as --dock-h so the "scroll to bottom" button always
    // floats just above it, even when the textarea grows or chips appear.
    const main = $("main");

    if (main && "ResizeObserver" in window) {

        const chips = $("attachment-chip");

        const updateDock = () => {

            const top = (chips && !chips.classList.contains("hidden") ? chips : composer).getBoundingClientRect().top;

            main.style.setProperty("--dock-h", `${Math.max(0, Math.round(main.getBoundingClientRect().bottom - top))}px`);
        };

        const observer = new ResizeObserver(updateDock);

        [composer, chips, $("composer-note"), main].forEach(node => node && observer.observe(node));

        document.addEventListener("lotus:attachments-changed", () => requestAnimationFrame(updateDock));

        updateDock();
    }

    // Welcome greeting
    const line = document.querySelector("#welcome-screen > p");

    if (line) line.textContent = `${greeting()}! Bugün ne üretelim?`;

    // "/" focuses the message box (like many chat apps) — but never
    // while the user is typing somewhere else.
    document.addEventListener("keydown", event => {

        if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;

        const target = event.target;

        if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;

        if (document.querySelector(".modal:not(.hidden), .toast-confirm-overlay")) return;

        event.preventDefault();

        input.focus();
    });
}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", init);

} else {

    init();
}
