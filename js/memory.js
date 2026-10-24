// ==========================================================
// LOTUS AI — MEMORY SYSTEM
// ==========================================================
//
// What Lotus "remembers" about you, fed into every answer.
//
//  • signed in  → rows in the Supabase `memories` table (follow you
//                 across devices)
//  • guest      → this device's localStorage. Until now memory simply
//                 did not work without an account: the modal said "log
//                 in" and nothing could be saved. When a guest signs in,
//                 what they saved on this device is moved to the account.
//
// You can manage it from the Hafıza window, or just talk to Lotus:
//   "hatırla: kahveyi sütsüz içerim"   → saves
//   "unut: kahve"                      → forgets matching items
//   "hafızanı temizle"                 → forgets everything (asks first)
//   "neler hatırlıyorsun?"             → lists what is stored

import { supabase, Auth } from "./auth.js";
import { escapeHtml, icon } from "./utils.js";
import { showToast, showConfirm } from "./toast.js";
import config from "./config.js";

const GUEST_KEY = "lotus_memories_guest";
const MAX_GUEST_ITEMS = 100;
const MAX_CONTENT_LENGTH = 500;
const MAX_COMMAND_LENGTH = 320;

const CATEGORY_LABELS = {
    general: "Genel",
    preference: "Tercih",
    fact: "Bilgi",
    project: "Proje"
};

// ----------------------------------------------------------
// LOCAL (GUEST) STORAGE
// ----------------------------------------------------------

function readGuest() {

    try {

        const list = JSON.parse(localStorage.getItem(GUEST_KEY) || "[]");

        return Array.isArray(list) ? list : [];

    } catch {

        return [];
    }
}

function writeGuest(list) {

    try {

        localStorage.setItem(GUEST_KEY, JSON.stringify(list.slice(0, MAX_GUEST_ITEMS)));

        return true;

    } catch (error) {

        console.warn("🧠 Hafıza bu cihaza yazılamadı:", error);

        return false;
    }
}

function newId() {

    return globalThis.crypto?.randomUUID?.() ?? `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const normalize = text => String(text ?? "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

// ----------------------------------------------------------
// CHAT COMMANDS ("hatırla: …")
// ----------------------------------------------------------

const SEP = "\\s*[:,\\-–—]?\\s*";

const REMEMBER_PATTERNS = [
    new RegExp(`^(?:lütfen\\s+)?(?:bunu\\s+|şunu\\s+|bu bilgiyi\\s+)?hatırla(?:r\\s+mısın)?${SEP}(.{3,})$`, "u"),
    new RegExp(`^hafızana\\s+(?:kaydet|ekle|not et|yaz)${SEP}(.{3,})$`, "u"),
    new RegExp(`^(?:unutma|aklında tut|aklında bulunsun)(?:\\s+ki)?${SEP}(.{3,})$`, "u"),
    new RegExp(`^not al${SEP}(.{3,})$`, "u")
];

const FORGET_ALL_PATTERNS = [
    /^(?:hafızanı|hafızamı|hafızayı|tüm hafızayı|bütün hafızayı)\s+(?:temizle|sil|sıfırla)$/u,
    /^(?:her şeyi|hepsini|hiçbir şeyi|beni)\s+unut$/u,
    /^tüm(?:\s+hafıza)?\s+(?:kayıtlarını|bilgilerini)\s+sil$/u
];

const FORGET_PATTERNS = [
    new RegExp(`^(?:bunu\\s+|şunu\\s+)?unut${SEP}(.{2,})$`, "u"),
    /^(.{2,}?)\s+(?:bilgisini|notunu|kaydını)\s+(?:unut|sil)$/u
];

const LIST_PATTERNS = [
    /^neler?\s+hatırlıyorsun\??$/u,
    /^(?:hafızanda|hafızanda\s+bende?n?)\s+ne\s+var\??$/u,
    /^hafızayı\s+(?:göster|listele)$/u,
    /^benim\s+hakkımda\s+ne\s+biliyorsun\??$/u,
    /^(?:hakkımda|benim hakkımda)\s+neler\s+biliyorsun\??$/u
];

const Memory = {

    // ------------------------------------------------------
    // WHO ARE WE STORING FOR?
    // ------------------------------------------------------

    async getUserId() {

        try {

            const user = await Auth.getCurrentUser();

            return user?.id ?? null;

        } catch (error) {

            console.warn("🧠 Hafıza: kullanıcı okunamadı, misafir modu.", error);

            return null;
        }
    },

    /** "account" (synced) or "guest" (this device only). */
    async mode() {

        return (await this.getUserId()) ? "account" : "guest";
    },

    // Guest → account: move what was saved on this device once the
    // user signs in, so nothing is lost.
    async migrateGuest(userId) {

        if (this._migrating) return;

        const guest = readGuest();

        if (guest.length === 0) return;

        this._migrating = true;

        try {

            const rows = guest.map(item => ({
                user_id: userId,
                content: item.content,
                category: item.category || "general",
                importance: item.importance || 1
            }));

            const { error } = await supabase.from("memories").insert(rows);

            if (!error) {

                writeGuest([]);

                console.log(`🧠 ${rows.length} misafir hafızası hesaba taşındı.`);
            }

        } catch (error) {

            console.warn("🧠 Misafir hafızası taşınamadı:", error);

        } finally {

            this._migrating = false;
        }
    },

    // ------------------------------------------------------
    // READ
    // ------------------------------------------------------

    async getMemories(options = {}) {

        const userId = await this.getUserId();

        const limit = Number.isInteger(options.limit) ? options.limit : null;

        if (!userId) {

            const sorted = readGuest().sort((a, b) =>
                (b.importance - a.importance) || String(b.created_at).localeCompare(String(a.created_at)));

            return limit ? sorted.slice(0, limit) : sorted;
        }

        await this.migrateGuest(userId);

        let query = supabase
            .from("memories")
            .select("id, content, category, importance, created_at, updated_at")
            .eq("user_id", userId)
            .order("importance", { ascending: false })
            .order("created_at", { ascending: false });

        if (limit) query = query.limit(limit);

        const { data, error } = await query;

        if (error) {

            console.error("🧠 Hafızalar alınamadı:", error);

            return [];
        }

        return data ?? [];
    },

    // ------------------------------------------------------
    // ADD
    // ------------------------------------------------------

    async add(content, category = "general", importance = 1) {

        const text = String(content ?? "").trim().slice(0, MAX_CONTENT_LENGTH);

        if (!text) return { success: false, error: "Hafıza içeriği boş olamaz." };

        const safeImportance = Math.max(1, Math.min(5, Number(importance) || 1));

        const userId = await this.getUserId();

        // Don't store the same thing twice.
        const existing = (await this.getMemories()).find(item => normalize(item.content) === normalize(text));

        if (existing) return { success: true, memory: existing, duplicate: true };

        if (!userId) {

            const list = readGuest();

            if (list.length >= MAX_GUEST_ITEMS) {

                return { success: false, error: `Bu cihazda en fazla ${MAX_GUEST_ITEMS} hafıza tutulur. Eskileri silebilirsin.` };
            }

            const now = new Date().toISOString();

            const memory = {
                id: newId(),
                content: text,
                category,
                importance: safeImportance,
                created_at: now,
                updated_at: now
            };

            list.unshift(memory);

            if (!writeGuest(list)) return { success: false, error: "Tarayıcı depolaması dolu ya da kapalı." };

            return { success: true, memory };
        }

        const { data, error } = await supabase
            .from("memories")
            .insert({ user_id: userId, content: text, category, importance: safeImportance })
            .select()
            .single();

        if (error) {

            console.error("🧠 Hafıza eklenemedi:", error);

            return { success: false, error: error.message };
        }

        return { success: true, memory: data };
    },

    // ------------------------------------------------------
    // UPDATE
    // ------------------------------------------------------

    async update(id, updates = {}) {

        const allowed = {};

        ["content", "category", "importance"].forEach(field => {

            if (Object.prototype.hasOwnProperty.call(updates, field)) allowed[field] = updates[field];
        });

        allowed.updated_at = new Date().toISOString();

        const userId = await this.getUserId();

        if (!userId) {

            const list = readGuest();

            const item = list.find(entry => entry.id === id);

            if (!item) return { success: false, error: "Hafıza bulunamadı." };

            Object.assign(item, allowed);

            writeGuest(list);

            return { success: true, memory: item };
        }

        const { data, error } = await supabase
            .from("memories")
            .update(allowed)
            .eq("id", id)
            .eq("user_id", userId)
            .select()
            .single();

        if (error) {

            console.error("🧠 Hafıza güncellenemedi:", error);

            return { success: false, error: error.message };
        }

        return { success: true, memory: data };
    },

    // ------------------------------------------------------
    // DELETE
    // ------------------------------------------------------

    async remove(id) {

        const userId = await this.getUserId();

        if (!userId) {

            writeGuest(readGuest().filter(entry => entry.id !== id));

            return { success: true };
        }

        const { error } = await supabase
            .from("memories")
            .delete()
            .eq("id", id)
            .eq("user_id", userId);

        if (error) {

            console.error("🧠 Hafıza silinemedi:", error);

            return { success: false, error: error.message };
        }

        return { success: true };
    },

    async clearAll() {

        const userId = await this.getUserId();

        if (!userId) {

            writeGuest([]);

            return { success: true };
        }

        const { error } = await supabase.from("memories").delete().eq("user_id", userId);

        if (error) {

            console.error("🧠 Hafıza temizlenemedi:", error);

            return { success: false, error: error.message };
        }

        return { success: true };
    },

    // ------------------------------------------------------
    // FORMAT FOR THE AI
    // ------------------------------------------------------

    formatForAI(memories) {

        if (!Array.isArray(memories) || memories.length === 0) return "";

        return memories.map(memory => `- [${memory.category}] ${memory.content}`).join("\n");
    },

    // ------------------------------------------------------
    // CHAT COMMANDS
    // ------------------------------------------------------

    /**
     * Recognises "hatırla: …", "unut: …", "hafızanı temizle",
     * "neler hatırlıyorsun?". Returns null for everything else, so a long
     * message that merely mentions the word is never hijacked.
     */
    parseCommand(rawText) {

        const raw = String(rawText ?? "");

        if (raw.includes("[Eklenen dosya:") || raw.length > MAX_COMMAND_LENGTH) return null;

        // Keep the original casing of the stored text; match on a lowercased copy.
        const text = raw.trim().replace(/[.!]+$/u, "");

        const lower = text.toLocaleLowerCase("tr-TR");

        if (FORGET_ALL_PATTERNS.some(pattern => pattern.test(lower))) return { type: "forget-all" };

        if (LIST_PATTERNS.some(pattern => pattern.test(lower))) return { type: "list" };

        for (const pattern of REMEMBER_PATTERNS) {

            const match = lower.match(pattern);

            if (match) {

                // slice the original text by the same offset so capitals survive
                const content = text.slice(text.length - match[1].length).trim();

                return { type: "remember", content };
            }
        }

        for (const pattern of FORGET_PATTERNS) {

            const match = lower.match(pattern);

            if (match) return { type: "forget", query: match[1].trim() };
        }

        return null;
    },

    /** Performs a parsed command and returns the reply to show in the chat. */
    async runCommand(command) {

        if (!config.memoryEnabled) {

            return "Hafıza şu an kapalı. Ayarlar → Sohbet bölümünden “Hafızayı sohbetlerde kullan”ı açarsan hatırlayabilirim.";
        }

        const guest = (await this.mode()) === "guest";

        const where = guest
            ? "\n\n_Misafir olduğun için bu cihazda saklıyorum; giriş yaparsan hafızan hesabına taşınır ve her cihazda seninle olur._"
            : "";

        if (command.type === "remember") {

            const result = await this.add(command.content, "general", 2);

            if (!result.success) return `Bunu kaydedemedim: ${result.error}`;

            this.renderModalIfOpen();

            if (result.duplicate) return `Bunu zaten biliyorum: “${command.content}”.`;

            return `Tamam, hatırlayacağım: “${command.content}”.${where}`;
        }

        if (command.type === "list") {

            const memories = await this.getMemories();

            if (memories.length === 0) {

                return "Henüz hakkında kayıtlı bir şey yok. “hatırla: …” diyerek bana bir şey öğretebilirsin.";
            }

            return `Şunları hatırlıyorum:\n\n${memories.map(item => `- ${item.content}`).join("\n")}${where}`;
        }

        if (command.type === "forget-all") {

            const memories = await this.getMemories();

            if (memories.length === 0) return "Zaten kayıtlı bir hafızam yok.";

            const confirmed = await showConfirm(`Kayıtlı ${memories.length} hafızanın hepsi silinsin mi? Bu geri alınamaz.`, { okLabel: "Hepsini sil", danger: true });

            if (!confirmed) return "Tamam, hiçbir şeyi silmedim.";

            const result = await this.clearAll();

            this.renderModalIfOpen();

            return result.success ? "Hafızamı tamamen temizledim." : `Temizleyemedim: ${result.error}`;
        }

        if (command.type === "forget") {

            const needle = normalize(command.query);

            const matches = (await this.getMemories()).filter(item => normalize(item.content).includes(needle));

            if (matches.length === 0) return `“${command.query}” ile ilgili kayıtlı bir şey bulamadım.`;

            if (matches.length > 1) {

                const confirmed = await showConfirm(`“${command.query}” ile eşleşen ${matches.length} kayıt silinsin mi?`, { okLabel: "Sil", danger: true });

                if (!confirmed) return "Tamam, hiçbir şeyi silmedim.";
            }

            for (const item of matches) await this.remove(item.id);

            this.renderModalIfOpen();

            return matches.length === 1
                ? `Unuttum: “${matches[0].content}”.`
                : `${matches.length} kaydı unuttum.`;
        }

        return "";
    },

    // ------------------------------------------------------
    // HAFIZA WINDOW
    // ------------------------------------------------------

    renderModalIfOpen() {

        const modal = document.getElementById("memory-modal");

        if (modal && !modal.classList.contains("hidden")) this.renderModal();
    },

    async renderModal() {

        const list = document.getElementById("memory-list");

        if (!list) return;

        const guest = (await this.mode()) === "guest";

        const memories = await this.getMemories();

        const note = guest
            ? `<div class="memory-note">${icon("info")}<span>Giriş yapmadın: hafıza <strong>bu cihazda</strong> saklanır. Giriş yaparsan hesabına taşınır ve her cihazda seninle olur.</span></div>`
            : "";

        if (memories.length === 0) {

            list.innerHTML = `${note}<div class="memory-empty">Henüz kayıtlı bir hafıza yok.<br>Yukarıdan ekleyebilir ya da sohbette <strong>“hatırla: …”</strong> yazabilirsin.</div>`;

            return;
        }

        list.innerHTML = note + memories.map(memory => `
            <div class="memory-item" data-id="${escapeHtml(memory.id)}">
                <div>
                    <div class="memory-item-category">${escapeHtml(CATEGORY_LABELS[memory.category] || memory.category || "Genel")}</div>
                    <div class="memory-item-content">${escapeHtml(memory.content)}</div>
                </div>
                <button class="memory-item-delete" type="button" data-id="${escapeHtml(memory.id)}" title="Sil" aria-label="Sil">${icon("trash")}</button>
            </div>
        `).join("");

        list.querySelectorAll(".memory-item-delete").forEach(button => {

            button.addEventListener("click", async event => {

                event.stopPropagation();

                const item = button.closest(".memory-item");

                item?.classList.add("removing");

                const result = await this.remove(button.dataset.id);

                if (!result.success) {

                    item?.classList.remove("removing");

                    showToast(`Silinemedi: ${result.error}`, "error");

                    return;
                }

                // Let the removal animation play before the list re-renders.
                setTimeout(() => this.renderModal(), 170);
            });
        });
    }
};


// ----------------------------------------------------------
// WIRE THE HAFIZA WINDOW
// ----------------------------------------------------------

function wire() {

    const memoryModal = document.getElementById("memory-modal");

    document.getElementById("memory-button")?.addEventListener("click", event => {

        event.preventDefault();

        if (!memoryModal) return;

        memoryModal.classList.remove("hidden");

        Memory.renderModal();
    });

    memoryModal?.querySelectorAll(".close-modal").forEach(button => {

        button.addEventListener("click", () => memoryModal.classList.add("hidden"));
    });

    const addInput = document.getElementById("memory-add-input");
    const addCategory = document.getElementById("memory-add-category");
    const addButton = document.getElementById("memory-add-button");

    addButton?.addEventListener("click", async () => {

        const content = addInput.value.trim();

        if (!content) {

            addInput.focus();

            return;
        }

        addButton.disabled = true;

        const result = await Memory.add(content, addCategory.value);

        addButton.disabled = false;

        if (result.success) {

            addInput.value = "";

            if (result.duplicate) showToast("Bu zaten kayıtlı.", "info", 2200);

            Memory.renderModal();

        } else {

            showToast(`Hafıza eklenemedi: ${result.error}`, "error");
        }
    });

    addInput?.addEventListener("keydown", event => {

        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {

            event.preventDefault();

            addButton?.click();
        }
    });
}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", wire);

} else {

    wire();
}


export default Memory;
