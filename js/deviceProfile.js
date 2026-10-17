/**
 * ==========================================================
 * Lotus AI - Device Capability Profiling
 * ==========================================================
 * Picks an Ollama model tier based on real, available browser
 * signals (navigator.deviceMemory, navigator.hardwareConcurrency)
 * and adapts it over time using measured response latency —
 * "cihazın RAM/CPU tüketimine göre modeli artırıp azaltabilsin".
 *
 * Honesty note: navigator.deviceMemory is Chrome/Edge/Android
 * only and reports a capped, approximate value (never above 8),
 * and hardwareConcurrency reports logical cores, not real-time
 * load. This is a reasonable starting heuristic, not a precise
 * hardware readout — Safari/iOS will always fall back to the
 * "mid" tier since deviceMemory isn't exposed there at all.
 * ==========================================================
 */

const STORAGE_KEY = "lotus_device_tier_v1";

export const TIERS = {
    low: {
        label: "Düşük (hafif cihaz)",
        models: ["tinyllama", "qwen2.5:0.5b", "phi3:mini"]
    },
    mid: {
        label: "Orta",
        models: ["llama3.2:3b", "gemma2:2b", "phi3:mini"]
    },
    high: {
        label: "Yüksek",
        models: ["llama3.1:8b", "mistral", "llama3.2:3b"]
    }
};

function detectBaseTier() {

    const ramGB = navigator.deviceMemory || null; // Chrome/Android only, capped at 8
    const cores = navigator.hardwareConcurrency || null;

    // No signal at all (e.g. Safari/iOS) — assume a safe middle ground.
    if (!ramGB && !cores) return "mid";

    if ((ramGB && ramGB <= 2) || (cores && cores <= 2)) return "low";

    if ((ramGB && ramGB >= 6) || (cores && cores >= 8)) return "high";

    return "mid";
}

const DeviceProfile = {

    tier: null,

    init() {

        const stored = localStorage.getItem(STORAGE_KEY);

        this.tier = TIERS[stored] ? stored : detectBaseTier();

        this.persist();
    },

    persist() {

        localStorage.setItem(STORAGE_KEY, this.tier);
    },

    getModel() {

        return TIERS[this.tier].models[0];
    },

    getTierInfo() {

        return { tier: this.tier, ...TIERS[this.tier] };
    },

    /**
     * Call after each completed Ollama response with how long it took
     * (ms). Consistently slow responses step the tier down one level;
     * consistently fast ones allow a step back up. Deliberately mild
     * (single-step, needs 3 consistent samples) so one slow network
     * blip doesn't yank the model down.
     */
    reportLatency(latencyMs) {

        const SLOW_MS = 12000;
        const FAST_MS = 3000;

        const samples = JSON.parse(localStorage.getItem(STORAGE_KEY + "_samples") || "[]");

        samples.push(latencyMs);

        while (samples.length > 3) samples.shift();

        localStorage.setItem(STORAGE_KEY + "_samples", JSON.stringify(samples));

        if (samples.length < 3) return;

        const allSlow = samples.every(ms => ms > SLOW_MS);
        const allFast = samples.every(ms => ms < FAST_MS);

        if (allSlow && this.tier !== "low") {

            this.tier = this.tier === "high" ? "mid" : "low";

            this.persist();

            console.warn(`🐌 Ollama yanıtları yavaş, model seviyesi düşürüldü: ${this.tier}`);

        } else if (allFast && this.tier !== "high") {

            this.tier = this.tier === "low" ? "mid" : "high";

            this.persist();

            console.log(`⚡ Ollama yanıtları hızlı, model seviyesi yükseltildi: ${this.tier}`);
        }
    }
};

DeviceProfile.init();

export default DeviceProfile;
