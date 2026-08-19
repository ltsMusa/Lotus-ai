// ==========================================================
// LOTUS AI — MEMORY SYSTEM
// ==========================================================

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
    }

};
