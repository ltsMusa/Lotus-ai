/**
 * ==========================================================
 * Lotus AI — Quick Actions
 * ==========================================================
 * Connects the welcome-screen shortcuts and sidebar About
 * button to real functionality:
 *  - Kod Yaz     → fills a coding-focused starter prompt
 *  - Görsel Oluştur → REAL image generation (js/imageGen.js,
 *                     Pollinations.ai — free, keyless)
 *  - Web Analiz  → REAL page fetch (js/webAnalyze.js,
 *                     r.jina.ai reader) fed to the AI as context
 *  - Dosya Analiz → opens the real file picker (js/attachments.js)
 * ==========================================================
 */

import chatManager from "./chat.js";
import { fetchPageText } from "./webAnalyze.js";
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

        const prompt = await showPrompt("Ne çizmemi istersin?", "örn. yağmurda duran mor bir lotus çiçeği");

        if (!prompt) return;

        chatManager.addUserMessage(`🎨 Görsel oluştur: ${prompt}`);

        await chatManager.regenerateImage(prompt);
    });

    // ------------------------------------------------------
    // WEB ANALİZ — real page fetch, fed to the AI as context
    // ------------------------------------------------------

    document.getElementById("quick-web")?.addEventListener("click", async () => {

        const url = await showPrompt("Analiz etmemi istediğin sayfanın linki:", "https://...");

        if (!url || !url.trim()) return;

        chatManager.showTyping("Sayfa okunuyor...");

        try {

            const page = await fetchPageText(url.trim());

            chatManager.hideTyping();

            const notice = page.truncated ? " (sayfa uzun olduğu için kısaltıldı)" : "";

            // Mirrors js/attachments.js's pattern: the SAME text is both
            // shown to the user and sent to the AI (processMessage finds
            // "what to reply to" via the last entry in this.messages, so
            // the displayed and sent text must be identical — a short
            // display text with a separately-passed long prompt would
            // silently send the SHORT text to the AI, losing the fetched
            // page content entirely).
            const fullText =
                `🌐 Bu sayfayı özetle: ${page.url}${notice}\n\n[Sayfa içeriği]\n${page.text}`;

            chatManager.addUserMessage(fullText);

            await chatManager.processMessage(fullText);

        } catch (error) {

            chatManager.hideTyping();

            chatManager.hideTyping();

            // FIX: no user message was ever added at this point (the
            // fetch failed before we got there), so the normal
            // error-bubble "Tekrar dene" button would retry whatever
            // unrelated message came before this — a toast avoids that
            // misleading retry entirely.
            showToast(error.message, "error");
        }
    });

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
