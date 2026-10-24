/**
 * ==========================================================
 * Lotus AI — Quick Actions
 * ==========================================================
 * Connects the welcome-screen shortcuts and sidebar About
 * button to real functionality:
 *  - Kod Yaz        → fills a coding-focused starter prompt
 *  - Görsel Oluştur → REAL image generation (js/imageGen.js)
 *  - Web Analiz     → opens the "Özetle" web tool (js/tools.js):
 *                     a link is fetched and read, or pasted text
 *                     is summarised
 *  - Dosya Analiz   → opens the real file picker (js/attachments.js)
 * ==========================================================
 */

import chatManager from "./chat.js";
import { openTools } from "./tools.js";
import { showPrompt, showToast } from "./toast.js";

document.addEventListener("DOMContentLoaded", () => {

    const input = document.getElementById("message-input");
    const aboutModal = document.getElementById("about-modal");

    const setPrompt = text => {

        if (!input) return;

        input.value = text;
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    document.getElementById("quick-code")?.addEventListener("click", () => {
        setPrompt("Birlikte kod yazalım. Ne geliştirmek istiyorsun?");
    });

    document.getElementById("quick-file")?.addEventListener("click", () => {
        // attachments.js owns the actual supported-file picker.
        document.getElementById("attach-button")?.click();
    });

    // ------------------------------------------------------
    // GÖRSEL OLUŞTUR — real image generation
    // ------------------------------------------------------

    document.getElementById("quick-image")?.addEventListener("click", async () => {

        if (chatManager.isGenerating) {

            showToast("Lotus şu an bir yanıt hazırlıyor — bitince tekrar dene.", "info");

            return;
        }

        const prompt = await showPrompt("Ne çizmemi istersin?", "örn. yağmurda duran mor bir lotus çiçeği");

        if (!prompt) return;

        if (chatManager.isGenerating) return;

        chatManager.addUserMessage(`🎨 Görsel oluştur: ${prompt}`);

        chatManager.scrollToBottom(true);

        await chatManager.regenerateImage(prompt);
    });

    // ------------------------------------------------------
    // WEB ANALİZ — the "Özetle" tool
    // ------------------------------------------------------

    document.getElementById("quick-web")?.addEventListener("click", () => openTools("summarize"));

    // ------------------------------------------------------
    // ABOUT
    // ------------------------------------------------------

    document.getElementById("about-button")?.addEventListener("click", event => {

        event.preventDefault();

        aboutModal?.classList.remove("hidden");
    });

    aboutModal?.querySelectorAll(".close-modal").forEach(button => {
        button.addEventListener("click", () => {
            aboutModal.classList.add("hidden");
        });
    });
});
