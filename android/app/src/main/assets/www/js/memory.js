// ==========================================================
// LOTUS AI — MEMORY SYSTEM
// ==========================================================
//
// FIX: this module previously referenced `Auth` and `supabase`
// as if they were globals. Both are declared inside auth.js's
// module scope (type="module"), so without an explicit export
// (now added — see js/auth.js) every function here threw
// "Auth is not defined" the instant it ran.

import { supabase, Auth } from "./auth.js";
import { escapeHtml } from "./utils.js";
import { showToast } from "./toast.js";

const Memory = {

    // ------------------------------------------------------
    // GET CURRENT USER ID
    // ------------------------------------------------------

    async getUserId() {

        const user =
            await Auth.getCurrentUser();

        if (!user) {

            console.warn(
                "🧠 Hafıza: Kullanıcı giriş yapmamış."
            );

            return null;
        }

        return user.id;
    },


    // ------------------------------------------------------
    // GET MEMORIES
    // ------------------------------------------------------

    async getMemories(options = {}) {

        const userId =
            await this.getUserId();

        if (!userId) return [];


        let query =
            supabase
                .from("memories")
                .select(
                    "id, content, category, importance, created_at, updated_at"
                )
                .eq(
                    "user_id",
                    userId
                )
                .order(
                    "importance",
                    {
                        ascending: false
                    }
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (
            options.limit &&
            Number.isInteger(options.limit)
        ) {

            query =
                query.limit(
                    options.limit
                );
        }


        const {
            data,
            error
        } =
            await query;


        if (error) {

            console.error(
                "🧠 Hafızalar alınamadı:",
                error
            );

            return [];
        }


        return data ?? [];
    },


    // ------------------------------------------------------
    // ADD MEMORY
    // ------------------------------------------------------

    async add(
        content,
        category = "general",
        importance = 1
    ) {

        const userId =
            await this.getUserId();

        if (!userId) {

            return {

                success: false,

                error:
                    "Kullanıcı giriş yapmamış."
            };
        }


        if (
            !content ||
            !String(content).trim()
        ) {

            return {

                success: false,

                error:
                    "Hafıza içeriği boş olamaz."
            };
        }


        const {
            data,
            error
        } =
            await supabase
                .from("memories")
                .insert({

                    user_id:
                        userId,

                    content:
                        String(content).trim(),

                    category:
                        category,

                    importance:
                        Math.max(
                            1,
                            Math.min(
                                5,
                                Number(importance) || 1
                            )
                        )

                })
                .select()
                .single();


        if (error) {

            console.error(
                "🧠 Hafıza eklenemedi:",
                error
            );

            return {

                success: false,

                error:
                    error.message
            };
        }


        console.log(
            "🧠 Yeni hafıza kaydedildi:",
            data
        );


        return {

            success: true,

            memory:
                data
        };
    },


    // ------------------------------------------------------
    // UPDATE MEMORY
    // ------------------------------------------------------

    async update(
        id,
        updates = {}
    ) {

        const userId =
            await this.getUserId();

        if (!userId) {

            return {

                success: false,

                error:
                    "Kullanıcı giriş yapmamış."
            };
        }


        const allowedFields = [
            "content",
            "category",
            "importance"
        ];


        const safeUpdates = {};


        for (
            const field
            of allowedFields
        ) {

            if (
                Object.prototype.hasOwnProperty.call(
                    updates,
                    field
                )
            ) {

                safeUpdates[field] =
                    updates[field];
            }
        }


        safeUpdates.updated_at =
            new Date().toISOString();


        const {
            data,
            error
        } =
            await supabase
                .from("memories")
                .update(
                    safeUpdates
                )
                .eq(
                    "id",
                    id
                )
                .eq(
                    "user_id",
                    userId
                )
                .select()
                .single();


        if (error) {

            console.error(
                "🧠 Hafıza güncellenemedi:",
                error
            );

            return {

                success: false,

                error:
                    error.message
            };
        }


        return {

            success: true,

            memory:
                data
        };
    },


    // ------------------------------------------------------
    // DELETE MEMORY
    // ------------------------------------------------------

    async remove(id) {

        const userId =
            await this.getUserId();

        if (!userId) {

            return {

                success: false,

                error:
                    "Kullanıcı giriş yapmamış."
            };
        }


        const {
            error
        } =
            await supabase
                .from("memories")
                .delete()
                .eq(
                    "id",
                    id
                )
                .eq(
                    "user_id",
                    userId
                );


        if (error) {

            console.error(
                "🧠 Hafıza silinemedi:",
                error
            );

            return {

                success: false,

                error:
                    error.message
            };
        }


        console.log(
            "🧠 Hafıza silindi:",
            id
        );


        return {

            success: true
        };
    },


    // ------------------------------------------------------
    // FORMAT MEMORIES FOR AI
    // ------------------------------------------------------

    formatForAI(memories) {

        if (
            !Array.isArray(memories) ||
            memories.length === 0
        ) {

            return "";
        }


        return memories
            .map(
                memory =>
                    `- [${memory.category}] ${memory.content}`
            )
            .join("\n");
    },


    // ------------------------------------------------------
    // FORGET EVERYTHING ("bunu unut" / clear all)
    // ------------------------------------------------------

    async clearAll() {

        const userId = await this.getUserId();

        if (!userId) {

            return { success: false, error: "Kullanıcı giriş yapmamış." };
        }

        const { error } = await supabase
            .from("memories")
            .delete()
            .eq("user_id", userId);

        if (error) {

            console.error("🧠 Hafıza temizlenemedi:", error);

            return { success: false, error: error.message };
        }

        return { success: true };
    },


    // ------------------------------------------------------
    // RENDER MEMORY MODAL (#memory-modal / #memory-list)
    // ------------------------------------------------------

    async renderModal() {

        const list = document.getElementById("memory-list");

        if (!list) return;

        const userId = await this.getUserId();

        if (!userId) {

            list.innerHTML = `<div class="memory-empty">Hafızayı görmek için giriş yapmalısın.</div>`;

            return;
        }

        const memories = await this.getMemories();

        if (memories.length === 0) {

            list.innerHTML = `<div class="memory-empty">Henüz kayıtlı bir hafıza yok.</div>`;

            return;
        }

        list.innerHTML = memories.map(memory => `
            <div class="memory-item" data-id="${memory.id}">
                <div>
                    <div class="memory-item-category">${escapeHtml(memory.category)}</div>
                    <div class="memory-item-content">${escapeHtml(memory.content)}</div>
                </div>
                <button class="memory-item-delete" data-id="${memory.id}" title="Sil">🗑</button>
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

                    return;
                }

                // Let the removal animation actually play before the
                // list re-renders out from under it.
                setTimeout(() => this.renderModal(), 160);
            });
        });
    }

};


// ----------------------------------------------------------
// WIRE MEMORY MODAL OPEN BUTTONS
// ----------------------------------------------------------
// ui.js owns generic modal open/close plumbing for settings,
// but explicitly does NOT touch the memory modal — that's
// this file's job, same pattern auth.js uses for account
// modals.

document.addEventListener("DOMContentLoaded", () => {

    const memoryModal = document.getElementById("memory-modal");

    const openButtons = [
        document.getElementById("memory-button"),
        document.getElementById("mobile-memory")
    ];

    openButtons.forEach(button => {

        if (!button) return;

        button.addEventListener("click", event => {

            event.preventDefault();

            if (!memoryModal) return;

            memoryModal.classList.remove("hidden");

            Memory.renderModal();
        });
    });

    memoryModal?.querySelectorAll(".close-modal").forEach(button => {

        button.addEventListener("click", () => {

            memoryModal.classList.add("hidden");
        });
    });

    // "+ Ekle" — the only way any memory ever gets created; without
    // this, Memory.add() existed but nothing in the app ever called
    // it, so the memory feature could be viewed/deleted but never
    // actually used.
    const addInput = document.getElementById("memory-add-input");
    const addCategory = document.getElementById("memory-add-category");
    const addButton = document.getElementById("memory-add-button");

    addButton?.addEventListener("click", async () => {

        const content = addInput.value.trim();

        if (!content) return;

        addButton.disabled = true;

        const result = await Memory.add(content, addCategory.value);

        addButton.disabled = false;

        if (result.success) {

            addInput.value = "";

            Memory.renderModal();

        } else {

            showToast(`Hafıza eklenemedi: ${result.error}`, "error");
        }
    });

    addInput?.addEventListener("keydown", event => {

        if (event.key === "Enter" && !event.shiftKey) {

            event.preventDefault();

            addButton?.click();
        }
    });
});


export default Memory;
