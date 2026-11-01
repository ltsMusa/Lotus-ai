/**
 * ==========================================================
 * Lotus AI - Key wizard (Groq / Gemini)
 * ==========================================================
 * No provider lets an app create an API key for the user from an
 * account login, so the wizard does the part that can be done:
 *
 *   1. opens the provider's key page          (user taps "create", "copy")
 *   2. notices the key on the clipboard       (when the user comes back)
 *   3. shows it masked, the user confirms
 *   4. tries it against the provider
 *   5. saves it — optionally in the account (js/keySync.js)
 *
 * Offered as a toast right after sign-in while the user has no key
 * of their own (never forced, not more than every few days), from
 * Settings → Yapay Zekâ, and from the chat's "no provider" message.
 * ==========================================================
 */

import config from "./config.js";
import { showToast } from "./toast.js";
import { escapeHtml, icon } from "./utils.js";
import { hasNative, callNative } from "./nativeBridge.js";
import KeySync from "./keySync.js";
import {
    KEY_PROVIDERS,
    findKey,
    freshCandidate,
    maskKey,
    testKey,
    hasAnyKey,
    shouldOfferWizard
} from "./keyTools.js";

const OFFERED_KEY = "lotus_keywiz_offered";

const CLIPBOARD_POLL_MS = 1500;

const GUIDE = {
    groq: [
        "Açılan sayfada Groq hesabınla giriş yap (Google ile de olur).",
        "“Create API Key” düğmesine bas, bir ad ver ve onayla.",
        "Çıkan anahtarı “Copy” ile kopyala.",
        "Bu uygulamaya dön — anahtarı otomatik yakalarım."
    ],
    gemini: [
        "Açılan sayfada Google hesabınla giriş yap.",
        "“Create API key” düğmesine bas (gerekirse bir proje seç).",
        "Çıkan anahtarı kopyala.",
        "Bu uygulamaya dön — anahtarı otomatik yakalarım."
    ]
};

const remember = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* storage unavailable */ } };

const recall = key => { try { return localStorage.getItem(key); } catch { return null; } };

// ----------------------------------------------------------
// State
// ----------------------------------------------------------

let root = null;

let wiz = null; // null while closed

function freshState(options = {}) {

    return {
        step: "choose", // choose | wait | found | testing | error | done
        provider: null,
        key: "",
        baseline: "",
        verdict: null,
        sync: false,
        account: null, // outcome of saving in the account, for the last screen
        onDone: options.onDone ?? null,
        checking: false,
        timer: null,
        onVisible: null,
        onKeydown: null
    };
}

export const isKeyWizardOpen = () => Boolean(wiz);

const label = provider => KEY_PROVIDERS[provider]?.label ?? "";

// ----------------------------------------------------------
// Clipboard
// ----------------------------------------------------------

async function readClipboard() {

    if (hasNative("readClipboard")) return String(callNative("readClipboard") ?? "");

    try {

        if (navigator.clipboard?.readText) return String(await navigator.clipboard.readText());

    } catch {

        // permission refused / page not focused: the paste box still works
    }

    return "";
}

// ----------------------------------------------------------
// Rendering
// ----------------------------------------------------------

function ensureRoot() {

    if (root?.isConnected) return root;

    root = document.createElement("div");

    root.id = "key-wizard";
    root.className = "modal keywiz hidden";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "keywiz-title");

    root.innerHTML = `
        <div class="modal-content keywiz-content">
            <div class="modal-header">
                <h2 id="keywiz-title">${icon("key")}Anahtar sihirbazı</h2>
                <button type="button" class="keywiz-close" data-action="close" aria-label="Kapat">${icon("x")}</button>
            </div>
            <div class="keywiz-body" aria-live="polite"></div>
        </div>
    `;

    root.addEventListener("click", event => {

        if (event.target === root) return close();

        const button = event.target.closest("[data-action]");

        if (button && !button.disabled) {

            handleAction(button.dataset.action, button.dataset).catch(error => console.warn("Anahtar sihirbazı hatası:", error));
        }
    });

    root.addEventListener("input", event => {

        if (event.target.matches("[data-keywiz-input]")) onManualInput(event.target.value);
    });

    root.addEventListener("change", event => {

        if (event.target.matches("[data-keywiz-sync]") && wiz) wiz.sync = event.target.checked;
    });

    document.body.appendChild(root);

    return root;
}

function syncRowHtml() {

    if (!KeySync.isSignedIn() || !KeySync.syncAvailable()) return "";

    return `
        <label class="settings-field settings-field-row keywiz-sync">
            <span>Hesabımda da sakla — başka telefonda giriş yapınca otomatik gelsin</span>
            <input type="checkbox" data-keywiz-sync ${wiz.sync ? "checked" : ""}>
        </label>
        <p class="keywiz-hint">Anahtar yalnızca senin hesabına bağlı tutulur. İstediğin zaman Ayarlar → Yapay Zekâ’dan kapatıp hesaptaki kopyayı silebilirsin.</p>
    `;
}

const VIEWS = {

    choose() {

        return `
            <p class="keywiz-lead">
                Lotus’u kendi ücretsiz yapay zekâ anahtarınla çalıştıralım. Yaklaşık bir dakika sürer:
                sayfayı ben açarım, sen anahtarı kopyalarsın, ben yakalayıp denerim ve kaydederim.
            </p>
            <div class="keywiz-choices">
                <button type="button" class="keywiz-card" data-action="pick" data-provider="groq">
                    <strong>Groq</strong>
                    <span>Çok hızlı · ücretsiz · önerilen</span>
                </button>
                <button type="button" class="keywiz-card" data-action="pick" data-provider="gemini">
                    <strong>Gemini</strong>
                    <span>Google hesabınla · ücretsiz kota</span>
                </button>
            </div>
            <button type="button" class="keywiz-link" data-action="manual">Anahtarım zaten var, yapıştıracağım</button>
            <button type="button" class="keywiz-link" data-action="close">Şimdi değil</button>
        `;
    },

    wait() {

        const provider = wiz.provider;

        const steps = provider
            ? `
                <p class="keywiz-lead">${escapeHtml(label(provider))} sayfası açıldı.</p>
                <ol class="keywiz-steps">${GUIDE[provider].map(text => `<li>${escapeHtml(text)}</li>`).join("")}</ol>
                <p class="keywiz-hint keywiz-live">Kopyalayıp buraya dönünce anahtarı kendim yakalarım.</p>
                <div class="keywiz-actions">
                    <button type="button" class="message-choice-button secondary" data-action="paste">Panodan al</button>
                    <button type="button" class="message-choice-button secondary" data-action="reopen">Sayfayı tekrar aç</button>
                </div>`
            : `<p class="keywiz-lead">Anahtarını yapıştır; hangi sağlayıcıya ait olduğunu kendim anlarım.</p>`;

        return `
            ${steps}
            <label class="settings-field">
                <span>${provider ? "Ya da anahtarı buraya yapıştır" : "Anahtar"}</span>
                <input type="password" data-keywiz-input autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="gsk_…  /  AIza…">
            </label>
            <p class="keywiz-hint" data-keywiz-status role="status"></p>
            <button type="button" class="keywiz-link" data-action="back">Geri</button>
        `;
    },

    found() {

        return `
            <p class="keywiz-lead">${escapeHtml(label(wiz.provider))} anahtarı buldum:</p>
            <div class="keywiz-key" aria-label="Bulunan anahtar (gizli)">${escapeHtml(maskKey(wiz.key))}</div>
            ${syncRowHtml()}
            <div class="keywiz-actions">
                <button type="button" class="message-choice-button primary" data-action="use">Bu anahtarı kullan</button>
                <button type="button" class="message-choice-button secondary" data-action="other">Başka anahtar</button>
            </div>
        `;
    },

    testing() {

        return `
            <p class="keywiz-lead keywiz-busy"><span class="keywiz-spinner" aria-hidden="true"></span>${escapeHtml(label(wiz.provider))} anahtarı deneniyor…</p>
            <div class="keywiz-key">${escapeHtml(maskKey(wiz.key))}</div>
        `;
    },

    error() {

        const verdict = wiz.verdict ?? {};

        // A wrong key is wrong; anything else may be the network or the provider's bad moment.
        const canForce = verdict.reason !== "invalid";

        return `
            <p class="keywiz-lead keywiz-problem">${icon("alert")}${escapeHtml(verdict.message ?? "Anahtar denenemedi.")}</p>
            <div class="keywiz-key">${escapeHtml(maskKey(wiz.key))}</div>
            <div class="keywiz-actions">
                ${canForce ? `<button type="button" class="message-choice-button primary" data-action="retry">Tekrar dene</button>` : ""}
                ${canForce ? `<button type="button" class="message-choice-button secondary" data-action="force">Yine de kullan</button>` : ""}
                <button type="button" class="message-choice-button ${canForce ? "secondary" : "primary"}" data-action="other">Başka anahtar</button>
            </div>
        `;
    },

    done() {

        const notes = [];

        if (wiz.verdict?.reason === "limited") notes.push(wiz.verdict.message);

        const account = wiz.account;

        if (account === "saved") notes.push("Hesabına da kaydedildi; başka cihazda giriş yapınca otomatik gelir.");
        else if (account === "failed") notes.push("Hesaba kaydedilemedi, ama anahtar bu cihazda çalışıyor.");
        else notes.push("Anahtar bu cihazda saklanıyor.");

        return `
            <div class="keywiz-done">
                <span class="keywiz-done-icon">${icon("check-circle")}</span>
                <p class="keywiz-lead">${escapeHtml(label(wiz.provider))} anahtarın hazır.</p>
            </div>
            ${notes.map(text => `<p class="keywiz-hint">${escapeHtml(text)}</p>`).join("")}
            <button type="button" class="message-choice-button primary" data-action="done">Tamam</button>
        `;
    }
};

function render() {

    if (!wiz || !root) return;

    root.querySelector(".keywiz-body").innerHTML = VIEWS[wiz.step]();

    root.dataset.step = wiz.step;

    // Focus a button, never the paste box — on a phone that would pop the keyboard up over the instructions.
    // (Only when there are no instructions, i.e. "I already have a key", the box is the point.)
    const focusTarget = root.querySelector(".message-choice-button.primary, .keywiz-card")
        ?? (wiz.step === "wait" && !wiz.provider ? root.querySelector("[data-keywiz-input]") : null);

    focusTarget?.focus?.({ preventScroll: true });
}

function setStatus(text) {

    const node = root?.querySelector("[data-keywiz-status]");

    if (node) node.textContent = text;
}

// ----------------------------------------------------------
// Watching the clipboard while the user is on the key page
// ----------------------------------------------------------

function startWatching() {

    stopWatching();

    const check = async () => {

        if (!wiz || wiz.step !== "wait" || wiz.checking) return;

        wiz.checking = true;

        try {

            consider(await readClipboard(), { manual: false });

        } finally {

            if (wiz) wiz.checking = false;
        }
    };

    wiz.onVisible = () => {

        if (document.visibilityState !== "visible") return;

        check();

        // The WebView needs a moment after resuming before the clipboard is readable.
        setTimeout(check, 500);
    };

    document.addEventListener("visibilitychange", wiz.onVisible);
    window.addEventListener("focus", wiz.onVisible);

    // Only the Android bridge can read quietly; the browser would show a permission prompt each time.
    if (hasNative("readClipboard")) wiz.timer = setInterval(check, CLIPBOARD_POLL_MS);
}

function stopWatching() {

    if (!wiz) return;

    if (wiz.onVisible) {

        document.removeEventListener("visibilitychange", wiz.onVisible);
        window.removeEventListener("focus", wiz.onVisible);
    }

    clearInterval(wiz.timer);

    wiz.onVisible = null;
    wiz.timer = null;
}

/** Text from the clipboard or the paste box → "found" screen when it holds a key. */
function consider(text, { manual }) {

    if (!wiz || wiz.step !== "wait") return false;

    const candidate = manual
        ? findKey(text, wiz.provider)
        : freshCandidate(text, wiz.baseline, wiz.provider);

    if (!candidate) return false;

    wiz.provider = candidate.provider;
    wiz.key = candidate.key;
    wiz.step = "found";

    stopWatching();

    render();

    return true;
}

function onManualInput(value) {

    if (!value) return setStatus("");

    if (!consider(value, { manual: true })) setStatus("Bu bir Groq (gsk_…) ya da Gemini (AIza…) anahtarına benzemiyor.");
}

// ----------------------------------------------------------
// Actions
// ----------------------------------------------------------

function openProviderPage(provider) {

    // Must stay synchronous inside the tap, or browsers block the new tab.
    window.open(KEY_PROVIDERS[provider].pageUrl, "_blank", "noopener,noreferrer");
}

async function startFlow(provider) {

    openProviderPage(provider);

    wiz.provider = provider;
    wiz.step = "wait";

    // What is on the clipboard now is old news (native only: reading is silent there).
    wiz.baseline = hasNative("readClipboard") ? await readClipboard() : "";

    if (!wiz || wiz.step !== "wait") return;

    render();

    startWatching();
}

async function useKey({ skipTest = false } = {}) {

    wiz.step = "testing";

    render();

    const verdict = skipTest ? { ok: true, reason: "skipped", message: "" } : await testKey(wiz.provider, wiz.key);

    if (!wiz) return;

    wiz.verdict = verdict;

    if (!verdict.ok) {

        wiz.step = "error";

        return render();
    }

    config.setProviderKey(wiz.provider, wiz.key);
    config.setProvider(wiz.provider);

    wiz.account = null;

    if (KeySync.isSignedIn() && KeySync.syncAvailable()) {

        const result = await KeySync.setSyncEnabled(wiz.sync);

        if (!wiz) return;

        wiz.account = wiz.sync ? (result.ok ? "saved" : "failed") : null;
    }

    wiz.step = "done";

    render();
}

async function handleAction(action, data) {

    if (!wiz) return;

    switch (action) {

        case "close":
            return close();

        case "pick":
            return startFlow(data.provider);

        case "manual":
            wiz.provider = null;
            wiz.step = "wait";
            wiz.baseline = "";
            render();
            return;

        case "back":
            stopWatching();
            wiz.step = "choose";
            wiz.provider = null;
            return render();

        case "reopen":
            return wiz.provider && openProviderPage(wiz.provider);

        case "paste": {

            // A browser may ask permission first and waits for the answer: say what is going on.
            setStatus(hasNative("readClipboard") ? "" : "Panoya bakıyorum — tarayıcı izin sorarsa “İzin ver”e dokun.");

            const text = await readClipboard();

            if (!consider(text, { manual: true })) setStatus("Panoda bir anahtar bulamadım. Anahtarı kopyaladığından emin ol ya da aşağıdaki kutuya yapıştır.");

            return;
        }

        case "use":
            return useKey();

        case "retry":
            return useKey();

        case "force":
            return useKey({ skipTest: true });

        case "other": {

            // The key that was just rejected must not be picked up again from the clipboard.
            const baseline = await readClipboard();

            if (!wiz) return;

            wiz.baseline = baseline;
            wiz.key = "";
            wiz.step = "wait";

            render();

            return startWatching();
        }

        case "done": {

            const { onDone, provider } = wiz;

            close();

            try { onDone?.({ provider }); } catch (error) { console.warn("Sihirbaz geri çağrısı hata verdi:", error); }
        }
    }
}

// ----------------------------------------------------------
// Open / close
// ----------------------------------------------------------

/**
 * @param {{ provider?: "groq"|"gemini", onDone?: Function }} [options]
 *   `provider` skips the first screen and opens that provider's key page
 *   straight away (call it from a tap, or the browser blocks the page).
 */
export function openKeyWizard(options = {}) {

    if (wiz) return;

    ensureRoot();

    wiz = freshState(options);

    // Uploading a secret is the user's call: the box starts empty unless they turned sync on before.
    wiz.sync = KeySync.syncPreference() === "on";

    wiz.onKeydown = event => { if (event.key === "Escape") close(); };

    document.addEventListener("keydown", wiz.onKeydown);

    root.classList.remove("hidden");

    // The user is acting on the wizard now, so the sign-in offer has done its job.
    remember(OFFERED_KEY, Date.now());

    if (options.provider && KEY_PROVIDERS[options.provider]) {

        startFlow(options.provider);

    } else {

        render();
    }
}

export function close() {

    if (!wiz) return;

    stopWatching();

    document.removeEventListener("keydown", wiz.onKeydown);

    wiz = null;

    root?.classList.add("hidden");
}

// ----------------------------------------------------------
// Offer after sign-in
// ----------------------------------------------------------

function offerAfterSignIn() {

    const decision = shouldOfferWizard({
        signedIn: true,
        hasKey: hasAnyKey(config.providers),
        lastOfferAt: Number(recall(OFFERED_KEY))
    });

    if (!decision || wiz) return;

    remember(OFFERED_KEY, Date.now());

    showToast(
        "Hesabın hazır. Kendi ücretsiz Groq ya da Gemini anahtarını bir dakikada ekleyebilirsin.",
        "info",
        15000,
        { actionLabel: "Anahtar al", onAction: () => openKeyWizard() }
    );
}

export function initKeyWizard() {

    if (initKeyWizard.done) return;

    initKeyWizard.done = true;

    KeySync.watchSignIn(({ adopted = [] }) => {

        if (adopted.length) {

            showToast(`Hesabındaki ${adopted.map(label).join(" ve ")} anahtarı bu cihaza eklendi.`, "success", 5000);

            return;
        }

        offerAfterSignIn();
    });
}

if (typeof document !== "undefined") {

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initKeyWizard, { once: true });
    else initKeyWizard();
}

export default { open: openKeyWizard, close, isOpen: isKeyWizardOpen };
