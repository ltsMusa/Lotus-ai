/**
 * ==========================================================
 * Lotus AI - Local model catalogue ("Lotus Mini")
 * ==========================================================
 * The on-device models. "Lotus Mini" is the name users see; what runs
 * is the open-source Qwen2.5-Instruct family (Apache 2.0), quantised
 * to Q4_K_M GGUF and executed by llama.cpp compiled to WebAssembly
 * (wllama, MIT) — no server, no GPU needed.
 *
 * Only models that fit a single GGUF file below 2 GB are listed: the
 * WASM engine cannot map a bigger single file. File names and sizes
 * were checked against the Hugging Face repositories (Oct 2026).
 *
 * `rank` orders the models by capability and cost: a higher rank is
 * smarter but slower, hotter and hungrier. js/localPolicy.js picks
 * among the installed ones from the device's power and temperature.
 * ==========================================================
 */

export const LOCAL_MODEL_NAME = "Lotus Mini";

export const LOCAL_MODELS = [
    {
        id: "mini-0.5b",
        rank: 1,
        name: "Lotus Mini Hafif",
        short: "Hafif",
        base: "Qwen2.5-0.5B-Instruct",
        quant: "Q4_K_M",
        file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
        sizeBytes: 491400032,
        // About how much memory the engine needs while it runs (model +
        // context + runtime). Shown to the user, used for the RAM check.
        runtimeMB: 800,
        nCtx: 2048
    },
    {
        id: "mini-1.5b",
        rank: 2,
        name: "Lotus Mini Güçlü",
        short: "Güçlü",
        base: "Qwen2.5-1.5B-Instruct",
        quant: "Q4_K_M",
        file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
        sizeBytes: 1117320736,
        runtimeMB: 1700,
        nCtx: 2048
    }
];

export const BUNDLED_MODEL_DIR = "models/";

export function getLocalModel(id) {

    return LOCAL_MODELS.find(model => model.id === id) || null;
}

export function formatBytes(bytes) {

    const value = Number(bytes) || 0;

    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2).replace(/\.?0+$/, "")} GB`;

    return `${Math.round(value / 1024 ** 2)} MB`;
}
