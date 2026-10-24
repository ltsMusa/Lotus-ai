/**
 * ==========================================================
 * Lotus AI - Image Viewer + Gallery
 * ==========================================================
 * Before this, a generated image (or a photo you attached) was a
 * small thumbnail with nothing behind it: no way to see it big,
 * save it, or find it again later.
 *
 *  - Tap any image in the chat → full-screen viewer with pinch /
 *    wheel / double-tap zoom, drag to pan, download, open-in-tab.
 *  - Sidebar → Görseller opens a gallery of every image Lotus has
 *    generated, across all chats (Storage.listImages()).
 *
 * The viewer's open/closed state is just the `hidden` class on
 * #image-viewer, so js/sidebar.js's global Esc handling can close
 * it without knowing anything about this file. A MutationObserver
 * here does the cleanup whoever closed it.
 * ==========================================================
 */

import Storage from "./storage.js";
import { showToast } from "./toast.js";
import { escapeHtml, icon } from "./utils.js";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 300;

const $ = id => document.getElementById(id);

const view = { scale: 1, x: 0, y: 0, src: "", alt: "" };

let lastFocus = null;

// ----------------------------------------------------------
// TRANSFORM
// ----------------------------------------------------------

function clampPan() {

    const stage = $("viewer-stage");
    const image = $("preview-image");

    if (!stage || !image) return;

    const overflowX = Math.max(0, (image.clientWidth * view.scale - stage.clientWidth) / 2);
    const overflowY = Math.max(0, (image.clientHeight * view.scale - stage.clientHeight) / 2);

    view.x = Math.max(-overflowX, Math.min(overflowX, view.x));
    view.y = Math.max(-overflowY, Math.min(overflowY, view.y));
}

function apply(animate = false) {

    const image = $("preview-image");
    const viewer = $("image-viewer");

    if (!image || !viewer) return;

    clampPan();

    image.style.transition = animate ? "transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
    image.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;

    viewer.classList.toggle("zoomed", view.scale > 1.01);
}

/** Zooms to `nextScale`, keeping the point (cx, cy) — relative to the stage centre — fixed. */
function zoomTo(nextScale, cx = 0, cy = 0, animate = false) {

    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));

    const ratio = clamped / view.scale;

    view.x = cx - (cx - view.x) * ratio;
    view.y = cy - (cy - view.y) * ratio;
    view.scale = clamped;

    if (clamped <= MIN_SCALE) {

        view.x = 0;
        view.y = 0;
    }

    apply(animate);
}

function stagePoint(event) {

    const rect = $("viewer-stage").getBoundingClientRect();

    return {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2
    };
}

// ----------------------------------------------------------
// OPEN / CLOSE
// ----------------------------------------------------------

export function openViewer(src, alt = "") {

    const viewer = $("image-viewer");
    const image = $("preview-image");

    if (!viewer || !image || !src) return;

    view.scale = 1;
    view.x = 0;
    view.y = 0;
    view.src = src;
    view.alt = alt;

    viewer.classList.remove("loaded", "failed", "zoomed");

    image.alt = alt;
    image.style.transform = "";

    image.onload = () => viewer.classList.add("loaded");

    image.onerror = () => {

        viewer.classList.add("failed");

        showToast("Görsel yüklenemedi.", "error");

        viewer.classList.add("hidden");
    };

    image.src = src;

    $("viewer-caption").textContent = alt || "";

    lastFocus = document.activeElement;

    viewer.classList.remove("hidden");

    $("viewer-close")?.focus({ preventScroll: true });
}

export function closeViewer() {

    $("image-viewer")?.classList.add("hidden");
}

/** Runs whoever hid the viewer (button, backdrop tap, Esc in sidebar.js). */
function onHidden() {

    const image = $("preview-image");

    if (image) {

        image.onload = null;
        image.onerror = null;

        // Release the (possibly large) bitmap.
        image.removeAttribute("src");
    }

    view.src = "";

    try { lastFocus?.focus?.({ preventScroll: true }); } catch { /* element is gone */ }

    lastFocus = null;
}

// ----------------------------------------------------------
// DOWNLOAD / OPEN
// ----------------------------------------------------------

function fileNameFor(alt, mime) {

    const base = String(alt || "lotus-gorsel")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "lotus-gorsel";

    const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[mime] || "png";

    return `${base}.${ext}`;
}

async function downloadCurrent() {

    const src = view.src;

    if (!src) return;

    try {

        let blob;

        if (src.startsWith("data:") || src.startsWith("blob:")) {

            blob = await (await fetch(src)).blob();

        } else {

            const response = await fetch(src, { mode: "cors" });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            blob = await response.blob();
        }

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;
        link.download = fileNameFor(view.alt, blob.type);

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 5000);

        showToast("Görsel indiriliyor…", "success", 1800);

    } catch {

        // Cross-origin without CORS, or a WebView that ignores `download`.
        openCurrentInTab();

        showToast("Doğrudan indirilemedi — görsel yeni sekmede açıldı; basılı tutup kaydedebilirsin.", "info", 5000);
    }
}

function openCurrentInTab() {

    if (view.src) window.open(view.src, "_blank", "noopener,noreferrer");
}

// ----------------------------------------------------------
// GESTURES (mouse wheel, pinch, drag, double tap)
// ----------------------------------------------------------

function bindGestures() {

    const stage = $("viewer-stage");
    const image = $("preview-image");

    if (!stage || !image) return;

    const pointers = new Map();

    let pinchStart = null;
    let dragStart = null;
    let downTarget = null;
    let moved = false;
    let lastTap = { time: 0, x: 0, y: 0 };

    stage.addEventListener("wheel", event => {

        event.preventDefault();

        const point = stagePoint(event);

        zoomTo(view.scale * Math.exp(-event.deltaY * 0.0018), point.x, point.y);

    }, { passive: false });

    stage.addEventListener("pointerdown", event => {

        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        // Remember what was really touched: once the pointer is captured
        // every later event reports the stage as its target.
        if (pointers.size === 1) downTarget = event.target;

        stage.setPointerCapture?.(event.pointerId);

        moved = false;

        if (pointers.size === 2) {

            const [a, b] = [...pointers.values()];

            pinchStart = {
                distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
                scale: view.scale
            };

            dragStart = null;

        } else if (pointers.size === 1) {

            dragStart = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
        }
    });

    stage.addEventListener("pointermove", event => {

        if (!pointers.has(event.pointerId)) return;

        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.size === 2 && pinchStart) {

            const [a, b] = [...pointers.values()];

            const distance = Math.hypot(a.x - b.x, a.y - b.y);

            const rect = stage.getBoundingClientRect();

            const cx = (a.x + b.x) / 2 - rect.left - rect.width / 2;
            const cy = (a.y + b.y) / 2 - rect.top - rect.height / 2;

            zoomTo(pinchStart.scale * (distance / pinchStart.distance), cx, cy);

            moved = true;

            return;
        }

        if (pointers.size === 1 && dragStart) {

            const dx = event.clientX - dragStart.x;
            const dy = event.clientY - dragStart.y;

            if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;

            if (view.scale > 1.01) {

                view.x = dragStart.vx + dx;
                view.y = dragStart.vy + dy;

                apply();
            }
        }
    });

    const release = event => {

        const wasSingle = pointers.size === 1;

        pointers.delete(event.pointerId);

        if (pointers.size < 2) pinchStart = null;

        if (pointers.size === 1) {

            // Finger lifted from a pinch — continue as a drag from here.
            const [remaining] = [...pointers.values()];

            dragStart = { x: remaining.x, y: remaining.y, vx: view.x, vy: view.y };

            return;
        }

        if (pointers.size > 0 || !wasSingle) return;

        dragStart = null;

        if (moved) return;

        // A tap (no drag). Two quick taps = toggle zoom; a tap on the
        // empty dark area (not on the picture) closes the viewer.
        const now = Date.now();

        const isDouble =
            now - lastTap.time < DOUBLE_TAP_MS &&
            Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 30;

        lastTap = { time: now, x: event.clientX, y: event.clientY };

        if (isDouble) {

            lastTap.time = 0;

            const point = stagePoint(event);

            zoomTo(view.scale > 1.01 ? 1 : 2.6, point.x, point.y, true);

        } else if (downTarget === stage) {

            setTimeout(() => {

                // Only if it stayed a single tap.
                if (lastTap.time !== 0 && Date.now() - lastTap.time >= DOUBLE_TAP_MS - 20) closeViewer();

            }, DOUBLE_TAP_MS);
        }
    };

    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);

    window.addEventListener("resize", () => {

        if (!$("image-viewer")?.classList.contains("hidden")) apply();
    });

    document.addEventListener("keydown", event => {

        const viewer = $("image-viewer");

        if (!viewer || viewer.classList.contains("hidden")) return;

        if (event.key === "+" || event.key === "=") zoomTo(view.scale * 1.3, 0, 0, true);
        else if (event.key === "-") zoomTo(view.scale / 1.3, 0, 0, true);
        else if (event.key === "0") zoomTo(1, 0, 0, true);
    });
}

// ----------------------------------------------------------
// GALLERY
// ----------------------------------------------------------

function renderGallerySkeleton(grid) {

    grid.innerHTML = Array.from({ length: 6 }, () => `<div class="gallery-item skeleton"></div>`).join("");
}

async function openGallery() {

    const modal = $("gallery-modal");
    const grid = $("gallery-grid");

    if (!modal || !grid) return;

    modal.classList.remove("hidden");

    renderGallerySkeleton(grid);

    let images = [];

    try {

        images = await Storage.listImages();

    } catch (error) {

        console.warn("🖼 Galeri yüklenemedi:", error);

        grid.innerHTML = `<div class="gallery-empty"><span class="empty-icon">${icon("alert", "ic ic-lg")}</span>Görseller yüklenemedi.<small>Bağlantını kontrol edip tekrar dene.</small></div>`;

        return;
    }

    if (images.length === 0) {

        grid.innerHTML = `
            <div class="gallery-empty">
                <span class="empty-icon">${icon("palette", "ic ic-lg")}</span>
                Henüz görsel yok.
                <small>Ana ekrandaki “Görsel Oluştur” ile ilk görselini üret; burada toplanır.</small>
            </div>`;

        return;
    }

    grid.innerHTML = images.map((image, index) => `
        <button type="button" class="gallery-item loading" data-index="${index}" title="${escapeHtml(image.alt || image.title)}">
            <img loading="lazy" decoding="async" src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || "Oluşturulan görsel")}">
            <span class="gallery-caption">${escapeHtml(image.alt || image.title)}</span>
        </button>
    `).join("");

    grid.querySelectorAll(".gallery-item").forEach(item => {

        const picture = item.querySelector("img");

        picture.addEventListener("load", () => item.classList.remove("loading"));

        picture.addEventListener("error", () => {

            item.classList.remove("loading");
            item.classList.add("broken");
        });

        item.addEventListener("click", () => {

            const image = images[Number(item.dataset.index)];

            if (image) openViewer(image.url, image.alt);
        });
    });
}

// ----------------------------------------------------------
// WIRING
// ----------------------------------------------------------

function init() {

    const viewer = $("image-viewer");

    if (viewer) {

        $("viewer-close")?.addEventListener("click", closeViewer);
        $("viewer-download")?.addEventListener("click", downloadCurrent);
        $("viewer-open")?.addEventListener("click", openCurrentInTab);

        new MutationObserver(() => {

            if (viewer.classList.contains("hidden")) onHidden();

        }).observe(viewer, { attributes: true, attributeFilter: ["class"] });

        bindGestures();
    }

    // Any picture inside the chat opens the viewer.
    $("chat")?.addEventListener("click", event => {

        const image = event.target.closest?.("img.message-image");

        if (!image) return;

        event.preventDefault();

        openViewer(image.currentSrc || image.src, image.alt);
    });

    document.addEventListener("lotus:open-gallery", openGallery);
}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", init);

} else {

    init();
}
