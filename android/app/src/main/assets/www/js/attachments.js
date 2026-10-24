/**
 * ==========================================================
 * Lotus AI - File Attachments (text, images, video frames)
 * ==========================================================
 * The 📎 button (and a matching #file-input with `multiple`
 * already in index.html) existed with nothing behind them —
 * clicking did nothing.
 *
 * Three kinds of attachment, all real:
 *  - Text/code files → content is read and appended to the
 *    message as text (js/attachments.js's original behavior).
 *  - Images → sent as actual image data to a vision-capable
 *    model (js/api.js's sendMessageWithImages) — the model
 *    really looks at the pixels, not a filename.
 *  - Video → there's no simple, keyless way for a browser app
 *    to hand a whole video to these APIs. Instead, a handful of
 *    frames are extracted client-side (HTML5 video + canvas)
 *    and sent as images — a real, honest approximation ("what
 *    do a few sampled moments look like"), not full video
 *    understanding. Said plainly to the user, not hidden.
 *
 * Honesty note: this is NOT the RAG/document pipeline from the
 * audit report (chunking, embeddings, vector search) — that
 * needs a backend. This is "hand the model your file's actual
 * content directly."
 * ==========================================================
 */

import { escapeHtml, icon } from "./utils.js";
import { showToast } from "./toast.js";

const MAX_TEXT_FILE_BYTES = 200 * 1024; // 200 KB per text file
const MAX_CHARS_PER_FILE = 6000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB picked from the gallery/camera (it is shrunk below)
const MAX_VIDEO_BYTES = 60 * 1024 * 1024; // 60 MB per video
const MAX_ATTACHMENTS = 8; // a video counts as VIDEO_FRAME_COUNT slots (one per frame)
const VIDEO_FRAME_COUNT = 4;

// Photos are shrunk before they are sent. A phone photo is 3–8 MB; as
// base64 that exceeds Vercel's 4.5 MB request limit and Groq's 4 MB image
// limit, so the "vision" feature silently failed for real photos. 1280 px
// on the long edge is plenty for a vision model and lands around 150–400 KB.
const IMAGE_MAX_EDGE = 1280;
const IMAGE_JPEG_QUALITY = 0.82;

const TEXT_EXTENSIONS = [
    "txt", "md", "markdown", "csv", "tsv", "json", "js", "jsx", "ts", "tsx",
    "py", "java", "c", "cpp", "cs", "go", "rs", "rb", "php", "html", "css",
    "yml", "yaml", "xml", "log", "sql", "sh"
];

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/ogg"];

// { type: "text", name, content, truncated }
// { type: "image", name, mimeType, dataUrl, note? }
let attachments = [];

function getExtension(filename) {

    return filename.split(".").pop()?.toLowerCase() ?? "";
}

function fileToDataUrl(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`"${file.name}" okunamadı.`));

        reader.readAsDataURL(file);
    });
}

function loadImageElement(file) {

    return new Promise((resolve, reject) => {

        const url = URL.createObjectURL(file);

        const image = new Image();

        image.onload = () => {

            URL.revokeObjectURL(url);

            resolve(image);
        };

        image.onerror = () => {

            URL.revokeObjectURL(url);

            reject(new Error(`"${file.name}" bir resim olarak açılamadı.`));
        };

        image.src = url;
    });
}

/**
 * Re-encodes an image as a JPEG no larger than IMAGE_MAX_EDGE px.
 * Transparent areas become white; animated GIFs keep their first frame.
 */
async function downscaleImage(file) {

    const source = window.createImageBitmap
        ? await createImageBitmap(file).catch(() => loadImageElement(file))
        : await loadImageElement(file);

    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;

    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(width, height));

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context = canvas.getContext("2d");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    source.close?.();

    return canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
}

function fileToText(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(`"${file.name}" okunamadı.`));

        reader.readAsText(file);
    });
}

/**
 * Extracts VIDEO_FRAME_COUNT evenly-spaced frames from a video file as
 * JPEG data URLs, using an off-DOM <video> + <canvas> — no upload, no
 * server, entirely in the browser. This is a real sampling of the
 * actual video content, not a placeholder.
 */
function extractVideoFrames(file) {

    return new Promise((resolve, reject) => {

        const video = document.createElement("video");

        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;

        const objectUrl = URL.createObjectURL(file);

        video.src = objectUrl;

        const frames = [];
        let captureIndex = 0;
        let timestamps = [];

        const cleanup = () => URL.revokeObjectURL(objectUrl);

        video.onloadedmetadata = () => {

            if (!video.duration || !isFinite(video.duration)) {

                cleanup();
                reject(new Error(`"${file.name}" süresi okunamadı — video bozuk olabilir.`));
                return;
            }

            timestamps = Array.from({ length: VIDEO_FRAME_COUNT }, (_, i) =>
                (video.duration * (i + 1)) / (VIDEO_FRAME_COUNT + 1)
            );

            video.currentTime = timestamps[0];
        };

        video.onseeked = () => {

            const canvas = document.createElement("canvas");

            canvas.width = Math.min(video.videoWidth, 768);
            canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));

            const ctx = canvas.getContext("2d");

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            frames.push(canvas.toDataURL("image/jpeg", 0.85));

            captureIndex += 1;

            if (captureIndex < timestamps.length) {

                video.currentTime = timestamps[captureIndex];

            } else {

                cleanup();
                resolve(frames);
            }
        };

        video.onerror = () => {

            cleanup();
            reject(new Error(`"${file.name}" işlenemedi — tarayıcı bu video formatını okuyamadı.`));
        };
    });
}

function renderChips() {

    document.dispatchEvent(new CustomEvent("lotus:attachments-changed"));

    const chip = document.getElementById("attachment-chip");

    if (!chip) return;

    if (attachments.length === 0) {

        chip.classList.add("hidden");
        chip.innerHTML = "";

        return;
    }

    chip.classList.remove("hidden");

    chip.innerHTML = attachments.map((item, index) => {

        const preview = item.type === "image"
            ? `<img class="attachment-chip-thumb" src="${item.dataUrl}" alt="">`
            : `<span class="attachment-chip-file">${icon("file")}</span>`;

        return `
            <span class="attachment-chip-item">
                ${preview}
                <span class="attachment-chip-name">${escapeHtml(item.name)}</span>
                <button class="attachment-chip-remove" type="button" data-index="${index}" aria-label="Kaldır">${icon("x")}</button>
            </span>
        `;
    }).join("");

    chip.querySelectorAll(".attachment-chip-remove").forEach(button => {

        button.addEventListener("click", () => {

            attachments.splice(Number(button.dataset.index), 1);

            renderChips();
        });
    });
}

/**
 * Consumes every pending attachment in one shot: text files become
 * appended prompt text (same as before), images (and extracted video
 * frames) become real image content for a vision-capable model. Call
 * once per send — this clears the pending list.
 */
export function consumeAttachments() {

    const textParts = attachments
        .filter(item => item.type === "text")
        .map(item => {

            const notice = item.truncated ? " (dosya uzun olduğu için kısaltıldı)" : "";

            return `\n\n[Eklenen dosya: ${item.name}${notice}]\n${item.content}`;
        })
        .join("");

    const images = attachments
        .filter(item => item.type === "image")
        .map(item => ({ mimeType: item.mimeType, dataUrl: item.dataUrl, note: item.note }));

    attachments = [];

    renderChips();

    return { text: textParts, images };
}

export function hasAttachment() {

    return attachments.length > 0;
}

export function hasImageAttachment() {

    return attachments.some(item => item.type === "image");
}

async function addTextFile(file) {

    if (file.size > MAX_TEXT_FILE_BYTES) {

        showToast(`"${file.name}" çok büyük (limit: ${Math.round(MAX_TEXT_FILE_BYTES / 1024)} KB).`, "error");
        return;
    }

    const raw = await fileToText(file);

    const truncated = raw.length > MAX_CHARS_PER_FILE;

    attachments.push({
        type: "text",
        name: file.name,
        content: truncated ? raw.slice(0, MAX_CHARS_PER_FILE) : raw,
        truncated
    });
}

async function addImageFile(file) {

    if (file.size > MAX_IMAGE_BYTES) {

        showToast(`"${file.name}" çok büyük (limit: ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB).`, "error");
        return;
    }

    let dataUrl;
    let mimeType = "image/jpeg";

    try {

        dataUrl = await downscaleImage(file);

    } catch (error) {

        // The browser could not decode it (e.g. HEIC). Send the original only
        // if it is small enough for the servers to accept.
        if (file.size > 3 * 1024 * 1024) {

            throw new Error(`"${file.name}" bu cihazda küçültülemedi ve çok büyük. JPG veya PNG olarak dene.`);
        }

        dataUrl = await fileToDataUrl(file);
        mimeType = file.type;
    }

    attachments.push({ type: "image", name: file.name || "yapıştırılan-görsel.jpg", mimeType, dataUrl });
}

async function addVideoFile(file) {

    if (file.size > MAX_VIDEO_BYTES) {

        showToast(`"${file.name}" çok büyük (limit: ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB).`, "error");
        return;
    }

    let frames;

    try {

        frames = await extractVideoFrames(file);

    } catch (error) {

        showToast(error.message, "error");
        return;
    }

    frames.forEach((dataUrl, index) => {

        attachments.push({
            type: "image",
            name: `${file.name} (kare ${index + 1}/${frames.length})`,
            mimeType: "image/jpeg",
            dataUrl,
            note: index === 0
                ? `"${file.name}" videosundan alınan ${frames.length} örnek kareden biri — tüm videoyu izlemedim, sadece bu anları gördüm.`
                : undefined
        });
    });
}

export async function addFiles(fileList) {

    const files = Array.from(fileList);

    if (files.length === 0) return;

    const slots = files.reduce((sum, file) => sum + (VIDEO_MIME_TYPES.includes(file.type) ? VIDEO_FRAME_COUNT : 1), 0);

    if (attachments.length + slots > MAX_ATTACHMENTS) {

        showToast(`En fazla ${MAX_ATTACHMENTS} ek (video kareleri dahil) ekleyebilirsin.`, "error");
        return;
    }

    for (const file of files) {

        try {

            if (IMAGE_MIME_TYPES.includes(file.type)) {

                await addImageFile(file);

            } else if (VIDEO_MIME_TYPES.includes(file.type)) {

                await addVideoFile(file);

            } else if (TEXT_EXTENSIONS.includes(getExtension(file.name))) {

                await addTextFile(file);

            } else {

                showToast(
                    `"${file.name}" desteklenmiyor. Lotus AI metin/kod dosyaları, ` +
                    "resimler (jpg/png/webp/gif) ve videolar (mp4/webm) kabul eder — " +
                    "PDF ve Word desteği için gerçek bir dosya/RAG sistemi gerekir."
                , "error");
            }

        } catch (error) {

            showToast(error.message || `"${file.name}" işlenemedi.`, "error");
        }
    }

    renderChips();
}

function ensureFileInput() {

    let input = document.getElementById("file-input");

    if (input) return input;

    // index.html is supposed to ship this <input>; if it is ever missing the
    // 📎 button used to silently do nothing. Create it instead.
    input = document.createElement("input");

    input.type = "file";
    input.id = "file-input";
    input.multiple = true;
    input.hidden = true;

    document.body.appendChild(input);

    return input;
}

function bindPasteAndDrop() {

    const messageInput = document.getElementById("message-input");

    // Pasting a screenshot / copied picture straight into the box.
    messageInput?.addEventListener("paste", event => {

        const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith("image/"));

        if (files.length === 0) return;

        event.preventDefault();

        addFiles(files);
    });

    // Drag files anywhere onto the window.
    let overlay = null;
    let depth = 0;

    const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes("Files");

    const showOverlay = () => {

        if (!overlay) {

            overlay = document.createElement("div");

            overlay.id = "drop-overlay";
            overlay.innerHTML = `<div><span>${icon("paperclip", "ic ic-xl")}</span><strong>Dosyayı bırak</strong><small>Görsel, video, metin veya kod dosyası</small></div>`;

            document.body.appendChild(overlay);
        }

        overlay.classList.add("visible");
    };

    const hideOverlay = () => {

        depth = 0;

        overlay?.classList.remove("visible");
    };

    window.addEventListener("dragenter", event => {

        if (!hasFiles(event)) return;

        event.preventDefault();

        depth += 1;

        showOverlay();
    });

    window.addEventListener("dragover", event => {

        if (!hasFiles(event)) return;

        event.preventDefault();

        event.dataTransfer.dropEffect = "copy";
    });

    window.addEventListener("dragleave", event => {

        if (!hasFiles(event)) return;

        depth = Math.max(0, depth - 1);

        if (depth === 0) hideOverlay();
    });

    window.addEventListener("drop", event => {

        if (!hasFiles(event)) return;

        event.preventDefault();

        hideOverlay();

        addFiles(event.dataTransfer.files);
    });
}

function init() {

    const attachButton = document.getElementById("attach-button");

    if (!attachButton) return;

    const fileInput = ensureFileInput();

    fileInput.accept = [
        ...TEXT_EXTENSIONS.map(ext => "." + ext),
        ...IMAGE_MIME_TYPES,
        ...VIDEO_MIME_TYPES
    ].join(",");

    attachButton.addEventListener("click", event => {

        event.preventDefault();

        fileInput.click();
    });

    fileInput.addEventListener("change", () => {

        if (fileInput.files?.length) addFiles(fileInput.files);

        fileInput.value = "";
    });

    bindPasteAndDrop();
}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", init);

} else {

    init();
}
