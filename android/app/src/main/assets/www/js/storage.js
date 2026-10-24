/**
 * ==========================================================
 * Lotus AI - Chat History / Conversation Storage
 * ==========================================================
 * Signed-in users: conversations + messages are persisted to
 * Supabase (tables defined in supabase/schema.sql), scoped to
 * the user via RLS.
 *
 * Guests / Supabase failures: falls back to localStorage
 * automatically, so chat history still works with no account
 * and the app never hard-fails just because the network or
 * the database is unavailable.
 *
 * Fires "lotus:conversation-changed" on document whenever the
 * active conversation switches, and "lotus:conversations-updated"
 * whenever the list itself changes — chat.js listens for both.
 * ==========================================================
 */

import { supabase, Auth } from "./auth.js";
import { generateId, formatRelativeDate, escapeHtml, debounce, icon } from "./utils.js";
import { showToast } from "./toast.js";

const LOCAL_KEY = "lotus_conversations_v1";
const ACTIVE_KEY = "lotus_active_conversation";

function loadLocal() {

    try {

        return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];

    } catch {

        return [];
    }
}

function saveLocal(conversations) {

    localStorage.setItem(LOCAL_KEY, JSON.stringify(conversations));
}

// ----------------------------------------------------------
// PINS — stored per device (a pin is a view preference, not chat
// data, so it needs no database migration).
// ----------------------------------------------------------

const PIN_KEY = "lotus_pinned_v1";

function getPinned() {

    try {

        const list = JSON.parse(localStorage.getItem(PIN_KEY));

        return new Set(Array.isArray(list) ? list : []);

    } catch {

        return new Set();
    }
}

function savePinned(set) {

    try {

        localStorage.setItem(PIN_KEY, JSON.stringify([...set]));

    } catch {

        // storage full / blocked — pins just won't persist this session
    }
}

/** Single-line, trimmed chat title from the first message. */
function makeTitle(text) {

    const clean = String(text || "")
        .replace(/\[Sayfa içeriği\][\s\S]*$/, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!clean) return "Yeni Sohbet";

    return clean.length > 42 ? clean.slice(0, 42).trimEnd() + "…" : clean;
}

const DAY_MS = 86400000;

function dayStart(date) {

    const d = new Date(date);

    d.setHours(0, 0, 0, 0);

    return d.getTime();
}

const GROUPS = ["Sabitlenenler", "Bugün", "Dün", "Son 7 gün", "Son 30 gün", "Daha eski"];

function groupIndex(conversation, pinned) {

    if (pinned) return 0;

    const days = Math.round((dayStart(Date.now()) - dayStart(conversation.updated_at)) / DAY_MS);

    if (days <= 0) return 1;
    if (days === 1) return 2;
    if (days <= 7) return 3;
    if (days <= 30) return 4;

    return 5;
}

function formatItemDate(dateInput) {

    const date = new Date(dateInput);

    if (isNaN(date)) return "";

    if (dayStart(date) === dayStart(Date.now())) {

        return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    }

    return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

let cloudWarned = false;

const Storage = {

    activeId: null,
    useSupabase: false,
    renderedIds: new Set(),

    // ------------------------------------------------------
    // INIT
    // ------------------------------------------------------

    async init() {

        const user = await Auth.getCurrentUser?.().catch(() => null);

        this.useSupabase = Boolean(user);

        this.activeId = localStorage.getItem(ACTIVE_KEY) || null;

        await this.renderSidebar();

        this.bindUI();

        window.addEventListener("online", () => this.recheckCloud());

        // Restore the last conversation after ChatManager has registered
        // its conversation-change listener.
        if (this.activeId) {
            const conversations = await this.listConversations();
            const exists = conversations.some(c => c.id === this.activeId);

            if (exists) {
                const messages = await this.loadMessages(this.activeId);

                document.dispatchEvent(new CustomEvent("lotus:conversation-changed", {
                    detail: { id: this.activeId, messages }
                }));
            } else {
                this.activeId = null;
                localStorage.removeItem(ACTIVE_KEY);
            }
        }

        // Auth can change after this module initializes. Keep history in
        // sync with the current account instead of permanently staying in
        // guest/localStorage mode.
        supabase?.auth?.onAuthStateChange?.(async (event, session) => {

            const nextUseSupabase = Boolean(session?.user);

            if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {

                // FIX: logging in used to just flip useSupabase to true —
                // any conversations made as a guest (still sitting in
                // localStorage) became permanently unreachable through the
                // UI from that point on (renderSidebar only ever lists
                // Supabase conversations once useSupabase is true), even
                // though the data technically still existed on-device.
                // Migrate them up first, so nothing a user made before
                // logging in ever just vanishes.
                if (nextUseSupabase) {
                    await this.migrateLocalToSupabase(session.user.id);
                }

                this.useSupabase = nextUseSupabase;

                await this.renderSidebar();

                if (this.activeId) {
                    const messages = await this.loadMessages(this.activeId);

                    document.dispatchEvent(new CustomEvent("lotus:conversation-changed", {
                        detail: { id: this.activeId, messages }
                    }));
                }

            } else if (event === "SIGNED_OUT") {

                this.useSupabase = false;
                this.activeId = null;
                localStorage.removeItem(ACTIVE_KEY);

                document.dispatchEvent(new CustomEvent("lotus:conversation-changed", {
                    detail: { id: null, messages: [] }
                }));

                await this.renderSidebar();
            }
        });
    },

    bindUI() {

        const newChatButtons = [
            document.getElementById("new-chat-button")
        ];

        newChatButtons.forEach(button => {

            if (!button) return;

            button.addEventListener("click", event => {

                event.preventDefault();

                this.startNewConversation();
            });
        });

        const search = document.getElementById("search-chat");

        if (search) {

            search.addEventListener("input", debounce(() => {

                this.renderSidebar(search.value.trim().toLowerCase());

            }, 200));
        }
    },

    // ------------------------------------------------------
    // LIST / LOAD
    // ------------------------------------------------------

    async listConversations() {

        if (this.useSupabase) {

            const user = await Auth.getCurrentUser();

            const { data, error } = await supabase
                .from("conversations")
                .select("id, title, created_at, updated_at")
                .eq("user_id", user.id)
                .order("updated_at", { ascending: false });

            if (error) {

                console.warn("💾 Sohbetler Supabase'den alınamadı, localStorage kullanılıyor:", error);

                this.useSupabase = false;

                if (!cloudWarned) {

                    cloudWarned = true;

                    showToast("Bulut bağlantısı yok — sohbetler şimdilik bu cihazda tutuluyor, bağlantı gelince otomatik eşitlenir.", "info", 5000);
                }

                return loadLocal();
            }

            return data ?? [];
        }

        return loadLocal().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    },

    async loadMessages(conversationId) {

        if (!conversationId) return [];

        if (this.useSupabase) {

            const { data, error } = await supabase
                .from("messages")
                .select("role, content, created_at")
                .eq("conversation_id", conversationId)
                .order("created_at", { ascending: true });

            if (error) {

                console.warn("💾 Mesajlar alınamadı:", error);

                // Keep the UI usable if Supabase temporarily fails.
                // Do not silently delete the active conversation.
                return [];
            }

            return data ?? [];
        }

        const conversation = loadLocal().find(c => c.id === conversationId);

        return conversation?.messages ?? [];
    },

    // ------------------------------------------------------
    // CREATE / UPDATE
    // ------------------------------------------------------

    async startNewConversation() {

        this.activeId = null;

        localStorage.removeItem(ACTIVE_KEY);

        document.dispatchEvent(new CustomEvent("lotus:conversation-changed", {
            detail: { id: null, messages: [] }
        }));

        await this.renderSidebar();
    },

    async ensureConversation(firstUserMessage) {

        if (this.activeId) return this.activeId;

        const title = makeTitle(firstUserMessage);

        if (this.useSupabase) {

            const user = await Auth.getCurrentUser();

            const { data, error } = await supabase
                .from("conversations")
                .insert({ user_id: user.id, title })
                .select()
                .single();

            if (!error && data) {

                this.activeId = data.id;

            } else {

                console.warn("💾 Sohbet oluşturulamadı, localStorage kullanılıyor:", error);

                this.useSupabase = false;
            }
        }

        if (!this.useSupabase) {

            const conversations = loadLocal();

            const conversation = {
                id: generateId(),
                title,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                messages: []
            };

            conversations.push(conversation);

            saveLocal(conversations);

            this.activeId = conversation.id;
        }

        localStorage.setItem(ACTIVE_KEY, this.activeId);

        await this.renderSidebar();

        return this.activeId;
    },

    async appendMessage(role, content) {

        const conversationId = await this.ensureConversation(role === "user" ? content : "Lotus AI");

        if (this.useSupabase) {

            const { error } = await supabase
                .from("messages")
                .insert({ conversation_id: conversationId, role, content });

            if (error) console.warn("💾 Mesaj kaydedilemedi:", error);

            await supabase
                .from("conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", conversationId);

        } else {

            const conversations = loadLocal();

            const conversation = conversations.find(c => c.id === conversationId);

            if (conversation) {

                conversation.messages.push({ role, content, created_at: new Date().toISOString() });

                conversation.updated_at = new Date().toISOString();

                saveLocal(conversations);
            }
        }

        return conversationId;
    },

    /**
     * Wipes and re-inserts every message for a conversation, in one
     * shot — used by regenerate/edit (js/chat.js) which need to drop
     * a tail of messages without tracking individual message ids.
     */
    /**
     * Uploads every guest/local conversation into Supabase for the
     * newly-signed-in user, then clears local storage so it can't get
     * migrated a second time (and doesn't linger as a stale "guest"
     * copy that could confuse a later logout). Safe to call on every
     * sign-in — it's a no-op once local storage is already empty.
     */
    async migrateLocalToSupabase(userId) {

        const localConversations = loadLocal();

        if (localConversations.length === 0) return;

        console.log(`💾 ${localConversations.length} misafir sohbeti hesaba aktarılıyor...`);

        const failed = [];

        for (const conversation of localConversations) {

            try {

                const { data, error } = await supabase
                    .from("conversations")
                    .insert({
                        user_id: userId,
                        title: conversation.title || "Yeni Sohbet",
                        created_at: conversation.created_at,
                        updated_at: conversation.updated_at
                    })
                    .select()
                    .single();

                if (error || !data) {

                    console.warn("💾 Sohbet aktarılamadı:", conversation.title, error);

                    failed.push(conversation);

                    continue;
                }

                const messages = conversation.messages || [];

                if (messages.length > 0) {

                    // Explicit, strictly increasing timestamps: a multi-row
                    // INSERT otherwise stamps every row with the same now(),
                    // which leaves message order undefined on reload.
                    const base = Date.parse(conversation.created_at) || Date.now() - messages.length * 1000;

                    const { error: messagesError } = await supabase
                        .from("messages")
                        .insert(messages.map((m, index) => ({
                            conversation_id: data.id,
                            role: m.role,
                            content: m.content,
                            created_at: new Date(base + index * 1000).toISOString()
                        })));

                    if (messagesError) {

                        console.warn("💾 Sohbet mesajları aktarılamadı:", messagesError);

                        // Roll back the half-created cloud copy and keep the
                        // local one, so nothing is lost and a retry is clean.
                        await supabase.from("conversations").delete().eq("id", data.id);

                        failed.push(conversation);

                        continue;
                    }
                }

                // The guest conversation's local id is about to stop
                // meaning anything (we're switching to Supabase ids) —
                // if it was the active one, follow it to its new home so
                // the user doesn't lose their place mid-migration.
                if (this.activeId === conversation.id) {

                    this.activeId = data.id;

                    localStorage.setItem(ACTIVE_KEY, data.id);
                }

            } catch (error) {

                console.warn("💾 Sohbet aktarılırken hata:", conversation.title, error);

                failed.push(conversation);
            }
        }

        // Only conversations that really made it to the cloud are dropped
        // locally; anything that failed stays put and is retried next time.
        if (failed.length === 0) {

            localStorage.removeItem(LOCAL_KEY);

        } else {

            saveLocal(failed);
        }

        console.log("💾 Misafir sohbetleri hesaba aktarıldı.", failed.length ? `(${failed.length} tanesi sonraya kaldı)` : "");
    },

    /**
     * Network came back after a cloud fallback: switch back to the
     * account, upload anything written while offline.
     */
    async recheckCloud() {

        if (this.useSupabase) return;

        const user = await Auth.getCurrentUser?.().catch(() => null);

        if (!user) return;

        try {

            await this.migrateLocalToSupabase(user.id);

            this.useSupabase = true;

            cloudWarned = false;

            await this.renderSidebar();

            showToast("Bulut bağlantısı geri geldi, sohbetler eşitlendi.", "success", 3000);

        } catch (error) {

            console.warn("💾 Bulut yeniden bağlanamadı:", error);
        }
    },

    async setMessages(conversationId, messages) {

        if (!conversationId) return;

        if (this.useSupabase) {

            // Insert the new rows FIRST, then delete the old ones: if the
            // insert fails the old conversation is still intact (the old
            // delete-then-insert order could wipe a chat on a flaky
            // connection). Explicit increasing timestamps keep the order
            // stable — one multi-row INSERT otherwise stamps every row
            // with the same now().
            const { data: oldRows } = await supabase
                .from("messages")
                .select("id")
                .eq("conversation_id", conversationId);

            if (messages.length > 0) {

                const base = Date.now();

                const { error } = await supabase.from("messages").insert(
                    messages.map((m, index) => ({
                        conversation_id: conversationId,
                        role: m.role,
                        content: m.content,
                        created_at: new Date(base + index).toISOString()
                    }))
                );

                if (error) {

                    console.warn("💾 Mesajlar yeniden yazılamadı:", error);

                    return;
                }
            }

            if (oldRows?.length) {

                await supabase.from("messages").delete().in("id", oldRows.map(row => row.id));
            }

            await supabase
                .from("conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", conversationId);

        } else {

            const conversations = loadLocal();

            const conversation = conversations.find(c => c.id === conversationId);

            if (conversation) {

                conversation.messages = messages.map(m => ({
                    role: m.role,
                    content: m.content,
                    created_at: new Date().toISOString()
                }));

                conversation.updated_at = new Date().toISOString();

                saveLocal(conversations);
            }
        }

        await this.renderSidebar();
    },

    async deleteConversation(conversationId) {

        if (this.useSupabase) {

            await supabase.from("messages").delete().eq("conversation_id", conversationId);

            await supabase.from("conversations").delete().eq("id", conversationId);

        } else {

            saveLocal(loadLocal().filter(c => c.id !== conversationId));
        }

        const pinned = getPinned();

        if (pinned.delete(conversationId)) savePinned(pinned);

        if (this.activeId === conversationId) {

            await this.startNewConversation();
        }

        await this.renderSidebar();
    },

    async switchTo(conversationId) {

        this.activeId = conversationId;

        localStorage.setItem(ACTIVE_KEY, conversationId);

        const messages = await this.loadMessages(conversationId);

        document.dispatchEvent(new CustomEvent("lotus:conversation-changed", {
            detail: { id: conversationId, messages }
        }));

        await this.renderSidebar();
    },

    // ------------------------------------------------------
    // RENAME / PIN / EXPORT / IMAGES
    // ------------------------------------------------------

    async renameConversation(conversationId, title) {

        const clean = makeTitle(title).replace(/…$/, "") || "Yeni Sohbet";

        const finalTitle = String(title || "").trim().slice(0, 80) || clean;

        if (this.useSupabase) {

            const { error } = await supabase
                .from("conversations")
                .update({ title: finalTitle })
                .eq("id", conversationId);

            if (error) {

                console.warn("💾 Sohbet adı değiştirilemedi:", error);

                return false;
            }

        } else {

            const conversations = loadLocal();

            const conversation = conversations.find(c => c.id === conversationId);

            if (!conversation) return false;

            conversation.title = finalTitle;

            saveLocal(conversations);
        }

        await this.renderSidebar();

        return true;
    },

    isPinned(conversationId) {

        return getPinned().has(conversationId);
    },

    async togglePin(conversationId) {

        const pinned = getPinned();

        const nowPinned = !pinned.has(conversationId);

        if (nowPinned) pinned.add(conversationId);
        else pinned.delete(conversationId);

        savePinned(pinned);

        await this.renderSidebar();

        return nowPinned;
    },

    async exportMarkdown(conversationId) {

        const conversation = (await this.listConversations()).find(c => c.id === conversationId);

        const messages = await this.loadMessages(conversationId);

        const title = conversation?.title || "Sohbet";

        const lines = [`# ${title}`, "", `_Lotus AI · ${new Date().toLocaleString("tr-TR")}_`, ""];

        for (const message of messages) {

            lines.push(`**${message.role === "user" ? "Sen" : "Lotus"}:**`, "", message.content, "", "---", "");
        }

        const slug = title
            .toLowerCase()
            .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "sohbet";

        return { title, filename: `lotus-${slug}.md`, markdown: lines.join("\n") };
    },

    /** Every generated image across all chats, newest first. */
    async listImages() {

        const conversations = await this.listConversations();

        const titleOf = new Map(conversations.map(c => [c.id, c.title]));

        const pattern = /!\[([^\]]*)\]\((https:\/\/image\.pollinations\.ai\/[^\s)]+)\)/g;

        const found = [];

        const collect = (conversationId, createdAt, content) => {

            for (const match of String(content || "").matchAll(pattern)) {

                found.push({
                    url: match[2],
                    alt: match[1],
                    conversationId,
                    title: titleOf.get(conversationId) || "Sohbet",
                    createdAt
                });
            }
        };

        if (this.useSupabase) {

            const { data, error } = await supabase
                .from("messages")
                .select("conversation_id, content, created_at")
                .eq("role", "assistant")
                .ilike("content", "%image.pollinations.ai%")
                .order("created_at", { ascending: false })
                .limit(200);

            if (error) console.warn("💾 Görseller alınamadı:", error);

            (data || []).forEach(row => collect(row.conversation_id, row.created_at, row.content));

        } else {

            loadLocal().forEach(conversation => {

                (conversation.messages || []).forEach(message => {

                    if (message.role === "assistant") {

                        collect(conversation.id, message.created_at || conversation.updated_at, message.content);
                    }
                });
            });

            found.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        const seen = new Set();

        return found.filter(image => !seen.has(image.url) && seen.add(image.url));
    },

    // ------------------------------------------------------
    // SIDEBAR RENDER
    // ------------------------------------------------------

    async renderSidebar(filter) {

        const list = document.getElementById("chat-list");

        if (!list) return;

        // Callers that just refresh the list (new message, rename, pin…)
        // pass nothing — keep whatever the user typed in the search box
        // instead of silently resetting the list to "everything".
        const query = (filter ?? document.getElementById("search-chat")?.value ?? "").trim().toLowerCase();

        const conversations = await this.listConversations();

        const pinned = getPinned();

        const filtered = query
            ? conversations.filter(c =>
                (c.title || "").toLowerCase().includes(query) ||
                (c.messages || []).some(m => String(m.content || "").toLowerCase().includes(query)))
            : conversations;

        if (filtered.length === 0) {

            list.innerHTML = query
                ? `<div class="chat-list-empty"><span class="empty-icon">${icon("search", "ic ic-lg")}</span>Sonuç bulunamadı.</div>`
                : `<div class="chat-list-empty"><span class="empty-icon">${icon("chat", "ic ic-lg")}</span>Henüz sohbet yok.<small>Yeni bir sohbet başlat, burada görünsün.</small></div>`;

            this.renderedIds = new Set();

            return;
        }

        const buckets = GROUPS.map(() => []);

        filtered.forEach(conversation => buckets[groupIndex(conversation, pinned.has(conversation.id))].push(conversation));

        // Pinned chats keep their own recency order; the rest are already
        // newest-first from listConversations().
        let enterIndex = 0;

        const nextRendered = new Set();

        list.innerHTML = buckets.map((items, index) => {

            if (items.length === 0) return "";

            const rows = items.map(conversation => {

                const isNew = !this.renderedIds.has(conversation.id);

                nextRendered.add(conversation.id);

                const classes = [
                    "chat-list-item",
                    conversation.id === this.activeId ? "active" : "",
                    pinned.has(conversation.id) ? "pinned" : "",
                    isNew ? "enter" : ""
                ].filter(Boolean).join(" ");

                const delay = isNew ? ` style="--i:${Math.min(enterIndex++, 12)}"` : "";

                return `
                    <div class="${classes}" data-id="${escapeHtml(conversation.id)}" role="button" tabindex="0"${delay}>
                        <div class="chat-list-item-main">
                            <div class="chat-list-item-title">${escapeHtml(conversation.title || "Yeni Sohbet")}</div>
                            <div class="chat-list-item-date">${escapeHtml(formatItemDate(conversation.updated_at))}</div>
                        </div>
                        <button class="chat-list-item-menu" type="button" data-id="${escapeHtml(conversation.id)}" aria-label="Sohbet seçenekleri">${icon("more")}</button>
                    </div>
                `;

            }).join("");

            return `<div class="chat-list-group"><div class="chat-list-group-label">${GROUPS[index]}</div>${rows}</div>`;

        }).join("");

        this.renderedIds = nextRendered;

        list.querySelectorAll(".chat-list-item").forEach(item => {

            const open = () => this.switchTo(item.dataset.id);

            item.addEventListener("click", event => {

                if (event.target.closest(".chat-list-item-menu")) return;

                open();
            });

            item.addEventListener("keydown", event => {

                if (event.target !== item) return;

                if (event.key === "Enter" || event.key === " ") {

                    event.preventDefault();

                    open();
                }
            });
        });
    }
};

document.addEventListener("DOMContentLoaded", () => Storage.init());

export default Storage;
