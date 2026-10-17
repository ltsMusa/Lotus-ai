/**
 * ==========================================================
 * Lotus AI - Backend Proxy (Vercel Serverless Function)
 * ==========================================================
 * The "doğru mimari" from the audit report:
 *
 *   Lotus AI Client → Lotus Backend → Provider → Groq/Gemini/...
 *
 * Real provider keys live only here, as Vercel Environment
 * Variables — never in the browser. The frontend calls this
 * endpoint when Settings → Yapay Zekâ → "Sunucu üzerinden çalış"
 * is on (config.useBackendProxy), instead of calling providers
 * directly with a locally-stored key.
 *
 * Request body:
 *   {
 *     provider: "groq" | "openai" | "openrouter" | "gemini",
 *     messages: [{ role: "system"|"user"|"assistant", content }],
 *     model?: string,
 *     stream?: boolean
 *   }
 *
 * DEPLOY:
 *   1. vercel env add GROQ_API_KEY
 *      (optional: several keys for automatic rotation on rate
 *      limit — use GROQ_API_KEYS="key1,key2,key3" instead)
 *   2. vercel env add GEMINI_API_KEY       (optional)
 *   3. vercel env add OPENAI_API_KEY       (optional)
 *   4. vercel env add OPENROUTER_API_KEY   (optional)
 *   5. vercel deploy
 * ==========================================================
 */

const OPENAI_STYLE = {
    groq: {
        url: "https://api.groq.com/openai/v1/chat/completions",
        envKey: "GROQ_API_KEY",
        defaultModel: "llama-3.3-70b-versatile"
    },
    openai: {
        url: "https://api.openai.com/v1/chat/completions",
        envKey: "OPENAI_API_KEY",
        defaultModel: "gpt-4o-mini"
    },
    openrouter: {
        url: "https://openrouter.ai/api/v1/chat/completions",
        envKey: "OPENROUTER_API_KEY",
        defaultModel: "openai/gpt-4o-mini"
    }
};

const GEMINI = {
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-2.0-flash"
};

// Very small in-memory rate limiter. Resets on cold start, so
// it's a speed bump against casual abuse, not a real limiter —
// for production, back this with Vercel KV / Upstash Redis
// keyed by IP or user id.
const requestLog = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

function isRateLimited(clientId) {

    const now = Date.now();

    const timestamps = (requestLog.get(clientId) || []).filter(
        ts => now - ts < RATE_LIMIT_WINDOW_MS
    );

    timestamps.push(now);

    requestLog.set(clientId, timestamps);

    return timestamps.length > RATE_LIMIT_MAX;
}

function splitSystemMessage(messages) {

    const systemMessage = messages.find(m => m.role === "system");

    const rest = messages.filter(m => m.role !== "system");

    return { systemText: systemMessage?.content || "", rest };
}

function toGeminiContents(messages) {

    return messages.map(message => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
    }));
}

// ----------------------------------------------------------
// KEY POOLS — automatic rotation
// ----------------------------------------------------------
// For GROQ_API_KEY, you can provide ONE key (GROQ_API_KEY) or
// SEVERAL (GROQ_API_KEYS="key1,key2,key3"). When a request hits
// a 429 on the current key, the proxy automatically retries the
// same request with the next key in the pool — fully transparent
// to the client. This is the real, honest version of "sistem
// otomatik yeni key alsın": rotating through keys you've already
// provisioned, not conjuring a brand new one from nothing (Groq
// has no public API for that).
// ----------------------------------------------------------

function getKeyPool(envKeyBase) {

    const plural = process.env[`${envKeyBase}S`]; // e.g. GROQ_API_KEYS

    if (plural) {

        return plural.split(",").map(key => key.trim()).filter(Boolean);
    }

    const single = process.env[envKeyBase];

    return single ? [single] : [];
}

async function fetchWithKeyRotation(envKeyBase, buildRequest, signal) {

    const pool = getKeyPool(envKeyBase);

    if (pool.length === 0) {

        return { ok: false, status: 500, keysExhausted: false, noKey: true };
    }

    let lastResponse = null;

    for (const apiKey of pool) {

        const { url, options } = buildRequest(apiKey);

        try {

            const response = await fetch(url, { ...options, signal });

            if (response.status !== 429) {

                return { ok: response.ok, status: response.status, response };
            }

            lastResponse = response;

            console.warn(`⚠️ ${envKeyBase} anahtarlarından biri limite takıldı, sıradaki deneniyor...`);

        } catch (error) {

            throw error;
        }
    }

    // Every key in the pool came back 429.
    return { ok: false, status: 429, keysExhausted: true, response: lastResponse };
}


// ----------------------------------------------------------
// Pipe an upstream SSE/fetch Response body directly to the
// client response, unchanged. Works because our frontend
// streaming.js parser already understands both the OpenAI
// "choices[0].delta" shape and the Gemini "candidates[0]"
// shape — this proxy doesn't need to reshape anything, just
// relay bytes.
// ----------------------------------------------------------

async function pipeStream(upstreamResponse, res) {

    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive"
    });

    const reader = upstreamResponse.body.getReader();

    try {

        while (true) {

            const { value, done } = await reader.read();

            if (done) break;

            res.write(value);
        }

    } finally {

        res.end();
    }
}

export default async function handler(req, res) {

    if (req.method !== "POST") {

        res.status(405).json({ error: "Yalnızca POST destekleniyor." });

        return;
    }

    const clientId = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";

    if (isRateLimited(clientId)) {

        res.status(429).json({ error: "Çok fazla istek. Lütfen biraz bekleyip tekrar dene." });

        return;
    }

    const { provider = "groq", messages, model, stream = false } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {

        res.status(400).json({ error: "'messages' dizisi gerekli." });

        return;
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), stream ? 60_000 : 20_000);

    try {

        // --------------------------------------------------
        // GEMINI — different request/response shape entirely
        // --------------------------------------------------

        if (provider === "gemini") {

            const { systemText, rest } = splitSystemMessage(messages);

            const chosenModel = model || GEMINI.defaultModel;

            const buildRequest = apiKey => ({
                url: stream
                    ? `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:streamGenerateContent?alt=sse&key=${apiKey}`
                    : `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`,
                options: {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemText }] },
                        contents: toGeminiContents(rest)
                    })
                }
            });

            const result = await fetchWithKeyRotation(GEMINI.envKey, buildRequest, controller.signal);

            if (result.noKey) {

                res.status(500).json({ error: `Sunucuda ${GEMINI.envKey} tanımlı değil.` });

                return;
            }

            if (!result.ok) {

                res.status(result.status).json({
                    error: `Sağlayıcı hatası (${result.status}).`,
                    keysExhausted: Boolean(result.keysExhausted)
                });

                return;
            }

            if (stream) {

                await pipeStream(result.response, res);

                return;
            }

            const data = await result.response.json();

            const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text).join("") ?? "";

            res.status(200).json({ text });

            return;
        }

        // --------------------------------------------------
        // GROQ / OPENAI / OPENROUTER — OpenAI-compatible shape
        // --------------------------------------------------

        const providerConfig = OPENAI_STYLE[provider];

        if (!providerConfig) {

            res.status(400).json({ error: `Bilinmeyen sağlayıcı: ${provider}` });

            return;
        }

        const buildRequest = apiKey => ({
            url: providerConfig.url,
            options: {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model || providerConfig.defaultModel,
                    messages,
                    stream
                })
            }
        });

        const result = await fetchWithKeyRotation(providerConfig.envKey, buildRequest, controller.signal);

        if (result.noKey) {

            res.status(500).json({
                error: `Sunucuda ${providerConfig.envKey} tanımlı değil. Vercel proje ayarlarından ekle.`
            });

            return;
        }

        if (!result.ok) {

            // Never forward the raw upstream error body to the client —
            // it can leak account/billing details tied to the server's
            // own key. Sanitize down to a status + generic message, but
            // DO tell the client when the whole key pool is exhausted
            // (429 on every key) so it can offer the "Limit doldu" choice
            // screen instead of a generic error.
            res.status(result.status).json({
                error: `Sağlayıcı hatası (${result.status}).`,
                keysExhausted: Boolean(result.keysExhausted)
            });

            return;
        }

        if (stream) {

            await pipeStream(result.response, res);

            return;
        }

        const data = await result.response.json();

        res.status(200).json({ text: data?.choices?.[0]?.message?.content ?? "" });

    } catch (error) {

        if (error.name === "AbortError") {

            res.status(504).json({ error: "İstek zaman aşımına uğradı." });

            return;
        }

        console.error("Lotus backend proxy error:", error);

        if (!res.headersSent) {

            res.status(500).json({ error: "Sunucu hatası." });
        }

    } finally {

        clearTimeout(timeout);
    }
}
