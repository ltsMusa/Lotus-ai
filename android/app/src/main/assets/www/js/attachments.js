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

import { escapeHtml } from "./utils.js";
import { showToast } from "./toast.js";

const MAX_TEXT_FILE_BYTES = 200 * 1024; // 200 KB per text file
const MAX_CHARS_PER_FILE = 6000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB per image
const MAX_VIDEO_BYTES = 60 * 1024 * 1024; // 60 MB per video
const MAX_ATTACHMENTS = 5;
const VIDEO_FRAME_COUNT = 4;

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
            : "📎";

        return `
            <span class="attachment-chip-item">
                ${preview}
                <span class="attachment-chip-name">${escapeHtml(item.name)}</span>
                <button class="attachment-chip-remove" type="button" data-index="${index}" aria-label="Kaldır">✕</button>
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

    const dataUrl = await fileToDataUrl(file);

    attachments.push({ type: "image", name: file.name, mimeType: file.type, dataUrl });
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

async function handleFiles(fileList) {

    const files = Array.from(fileList);

    if (attachments.length + files.length > MAX_ATTACHMENTS) {

        showToast(`En fazla ${MAX_ATTACHMENTS} dosya/görsel ekleyebilirsin.`, "error");
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

document.addEventListener("DOMContentLoaded", () => {

    const attachButton = document.getElementById("attach-button");
    const fileInput = document.getElementById("file-input");

    if (!attachButton || !fileInput) return;

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

        if (fileInput.files?.length) handleFiles(fileInput.files);

        fileInput.value = "";
    });
});
