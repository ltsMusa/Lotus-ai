// Unit tests for the pure parts of the local-AI automation.
// Run:  node --test tests/
import test from "node:test";
import assert from "node:assert/strict";

// Minimal localStorage for the modules that persist small state.
const store = new Map();
globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
};

const { pickLocalModel, pickThreadCount, hardwareCeilingRank, runtimeCeilingRank, recommendedModelId, worstThermal } =
    await import("../js/localPolicy.js");
const { planRoute, Cooldowns } = await import("../js/router.js");
const { thermalFromAndroidStatus, thermalFromBatteryTemp, thermalFromPressure, thermalFromSpeed } =
    await import("../js/deviceMonitor.js");

const COOL_STRONG = { ramGB: 8, ramExact: true, cores: 8, thermal: "normal", batteryPct: 80, charging: false, powerSave: false };

// ---------- thermal mappings ----------

test("android thermal status maps to our four states", () => {
    assert.equal(thermalFromAndroidStatus(0), "normal");
    assert.equal(thermalFromAndroidStatus(1), "normal");
    assert.equal(thermalFromAndroidStatus(2), "warm");
    assert.equal(thermalFromAndroidStatus(3), "hot");
    assert.equal(thermalFromAndroidStatus(4), "critical");
    assert.equal(thermalFromAndroidStatus(6), "critical");
    assert.equal(thermalFromAndroidStatus(-1), null);
    assert.equal(thermalFromAndroidStatus(undefined), null);
});

test("battery temperature thresholds", () => {
    assert.equal(thermalFromBatteryTemp(31), "normal");
    assert.equal(thermalFromBatteryTemp(39), "warm");
    assert.equal(thermalFromBatteryTemp(42.5), "hot");
    assert.equal(thermalFromBatteryTemp(45), "critical");
    assert.equal(thermalFromBatteryTemp(0), null);
});

test("pressure API states", () => {
    assert.equal(thermalFromPressure("nominal"), "normal");
    assert.equal(thermalFromPressure("fair"), "warm");
    assert.equal(thermalFromPressure("serious"), "hot");
    assert.equal(thermalFromPressure("critical"), "critical");
    assert.equal(thermalFromPressure("nope"), null);
});

test("speed drop is read as throttling, but needs samples", () => {
    assert.equal(thermalFromSpeed([10, 4]), "normal"); // too few samples
    assert.equal(thermalFromSpeed([10, 10, 9, 9]), "normal");
    assert.equal(thermalFromSpeed([10, 10, 6, 6]), "warm");
    assert.equal(thermalFromSpeed([10, 10, 3, 3]), "hot");
});

test("worstThermal picks the hottest", () => {
    assert.equal(worstThermal("normal", "hot", "warm"), "hot");
    assert.equal(worstThermal(), "normal");
});

// ---------- hardware / runtime ceilings ----------

test("hardware ceiling", () => {
    assert.equal(hardwareCeilingRank({ ramGB: 1, cores: 4 }), 0);
    assert.equal(hardwareCeilingRank({ ramGB: 4, ramExact: true, cores: 8 }), 1);
    assert.equal(hardwareCeilingRank({ ramGB: 6, ramExact: true, cores: 8 }), 2);
    assert.equal(hardwareCeilingRank({ ramGB: 6, ramExact: true, cores: 4 }), 1); // too few cores for the big one
    assert.equal(hardwareCeilingRank({ ramGB: 4, cores: 8 }), 1); // browser estimate is capped/rounded
    assert.equal(hardwareCeilingRank({ ramGB: 8, cores: 8 }), 2);
    assert.equal(hardwareCeilingRank({}), 1); // unknown → modest
});

test("runtime ceiling: heat, low battery and power saver lower it", () => {
    assert.equal(runtimeCeilingRank({ thermal: "normal" }), 2);
    assert.equal(runtimeCeilingRank({ thermal: "warm" }), 2);
    assert.equal(runtimeCeilingRank({ thermal: "hot" }), 1);
    assert.equal(runtimeCeilingRank({ thermal: "normal", batteryPct: 10, charging: false }), 1);
    assert.equal(runtimeCeilingRank({ thermal: "normal", batteryPct: 10, charging: true }), 2);
    assert.equal(runtimeCeilingRank({ thermal: "normal", powerSave: true }), 1);
});

test("thread count follows cores and heat", () => {
    assert.equal(pickThreadCount({ cores: 8, thermal: "normal" }), 4);
    assert.equal(pickThreadCount({ cores: 12, thermal: "normal" }), 4); // capped
    assert.equal(pickThreadCount({ cores: 4, thermal: "normal" }), 2);
    assert.equal(pickThreadCount({ cores: 8, thermal: "hot" }), 2);
    assert.equal(pickThreadCount({ cores: 8, thermal: "critical" }), 1);
    assert.equal(pickThreadCount({ cores: 8, thermal: "critical" }, false), 4); // adaptive off
    assert.equal(pickThreadCount({ cores: 1 }), 1);
});

// ---------- model choice ----------

test("nothing installed → no model", () => {
    const pick = pickLocalModel({ installedIds: [], snapshot: COOL_STRONG });
    assert.equal(pick.modelId, null);
});

test("cool strong device uses the big model", () => {
    const pick = pickLocalModel({ installedIds: ["mini-0.5b", "mini-1.5b"], snapshot: COOL_STRONG, prefs: { adaptive: true, preferred: "auto" } });
    assert.equal(pick.modelId, "mini-1.5b");
    assert.equal(pick.downgraded, false);
});

test("a hot device steps down to the small model, and recovers", () => {
    const both = ["mini-0.5b", "mini-1.5b"];
    const hot = pickLocalModel({ installedIds: both, snapshot: { ...COOL_STRONG, thermal: "hot" } });
    assert.equal(hot.modelId, "mini-0.5b");
    assert.equal(hot.downgraded, true);
    assert.ok(hot.reasons.includes("cihaz ısındı"));
    const cool = pickLocalModel({ installedIds: both, snapshot: COOL_STRONG });
    assert.equal(cool.modelId, "mini-1.5b");
});

test("low battery steps down", () => {
    const pick = pickLocalModel({ installedIds: ["mini-0.5b", "mini-1.5b"], snapshot: { ...COOL_STRONG, batteryPct: 9, charging: false } });
    assert.equal(pick.modelId, "mini-0.5b");
    assert.ok(pick.reasons.includes("pil azaldı"));
});

test("adaptive off ignores heat", () => {
    const pick = pickLocalModel({ installedIds: ["mini-0.5b", "mini-1.5b"], snapshot: { ...COOL_STRONG, thermal: "critical" }, prefs: { adaptive: false } });
    assert.equal(pick.modelId, "mini-1.5b");
});

test("a weak device never gets the big model even if installed", () => {
    const weak = { ramGB: 4, ramExact: true, cores: 8, thermal: "normal" };
    const pick = pickLocalModel({ installedIds: ["mini-0.5b", "mini-1.5b"], snapshot: weak });
    assert.equal(pick.modelId, "mini-0.5b");
});

test("only the big model installed but device is hot → still runs it, with fewer threads", () => {
    const pick = pickLocalModel({ installedIds: ["mini-1.5b"], snapshot: { ...COOL_STRONG, thermal: "hot" } });
    assert.equal(pick.modelId, "mini-1.5b");
    assert.equal(pick.threads, 2);
    assert.ok(pick.reasons.includes("yalnızca daha büyük model kurulu"));
});

test("user preference wins while cool, heat still overrides", () => {
    const both = ["mini-0.5b", "mini-1.5b"];
    const prefSmall = pickLocalModel({ installedIds: both, snapshot: COOL_STRONG, prefs: { adaptive: true, preferred: "mini-0.5b" } });
    assert.equal(prefSmall.modelId, "mini-0.5b");
    const prefBigHot = pickLocalModel({ installedIds: both, snapshot: { ...COOL_STRONG, thermal: "hot" }, prefs: { adaptive: true, preferred: "mini-1.5b" } });
    assert.equal(prefBigHot.modelId, "mini-0.5b");
});

test("recommendation by hardware", () => {
    assert.equal(recommendedModelId({ ramGB: 1 }), null);
    assert.equal(recommendedModelId({ ramGB: 4, ramExact: true, cores: 8 }), "mini-0.5b");
    assert.equal(recommendedModelId({ ramGB: 8, ramExact: true, cores: 8 }), "mini-1.5b");
});

// ---------- routing ----------

const NONE = () => 0;

test("auto: connected providers first, local last", () => {
    const plan = planRoute({ mode: "auto", online: true, cloud: ["groq", "openrouter"], local: ["wasm"], cooldownUntil: NONE });
    assert.deepEqual(plan.steps.map(s => `${s.kind}:${s.name}`), ["cloud:groq", "cloud:openrouter", "local:wasm"]);
});

test("auto: quota-exhausted provider is skipped, the next one used", () => {
    const now = 1_000_000;
    const plan = planRoute({ mode: "auto", cloud: ["groq", "openrouter"], local: ["wasm"], now, cooldownUntil: n => (n === "groq" ? now + 5000 : 0) });
    assert.deepEqual(plan.steps.map(s => s.name), ["openrouter", "wasm"]);
    assert.deepEqual(plan.skipped.map(s => s.name), ["groq"]);
});

test("auto: every provider parked → local model", () => {
    const now = 1_000_000;
    const plan = planRoute({ mode: "auto", cloud: ["groq", "openrouter"], local: ["wasm"], now, cooldownUntil: () => now + 5000 });
    assert.deepEqual(plan.steps.map(s => `${s.kind}:${s.name}`), ["local:wasm"]);
});

test("auto: no provider at all → local model", () => {
    const plan = planRoute({ mode: "auto", cloud: [], local: ["wasm", "ollama"] });
    assert.deepEqual(plan.steps.map(s => s.name), ["wasm", "ollama"]);
});

test("auto: offline → local only", () => {
    const plan = planRoute({ mode: "auto", online: false, cloud: ["groq"], local: ["wasm"] });
    assert.deepEqual(plan.steps.map(s => s.name), ["wasm"]);
    assert.equal(plan.offline, true);
});

test("auto: everything parked and no local → try the parked ones anyway", () => {
    const now = 1_000_000;
    const plan = planRoute({ mode: "auto", cloud: ["groq"], local: [], now, cooldownUntil: () => now + 5000 });
    assert.deepEqual(plan.steps.map(s => s.name), ["groq"]);
});

test("cloud-only mode never routes to local", () => {
    const plan = planRoute({ mode: "cloud", cloud: ["groq"], local: ["wasm"] });
    assert.deepEqual(plan.steps.map(s => s.kind), ["cloud"]);
});

test("local-only mode never routes to cloud", () => {
    const plan = planRoute({ mode: "local", cloud: ["groq"], local: ["wasm"] });
    assert.deepEqual(plan.steps.map(s => s.kind), ["local"]);
});

test("unknown mode falls back to auto", () => {
    const plan = planRoute({ mode: "banana", cloud: ["groq"], local: ["wasm"] });
    assert.equal(plan.steps.length, 2);
});

// ---------- cooldown book-keeping ----------

test("rate limits back off 2 → 6 → 18 min and a success resets them", () => {
    store.clear();
    const t0 = 5_000_000;
    const MIN = 60_000;
    assert.equal(Cooldowns.mark("groq", "RATE_LIMIT", t0) - t0, 2 * MIN);
    assert.equal(Cooldowns.mark("groq", "RATE_LIMIT", t0) - t0, 6 * MIN);
    assert.equal(Cooldowns.mark("groq", "RATE_LIMIT", t0) - t0, 18 * MIN);
    assert.ok(Cooldowns.isCooling("groq", t0 + MIN));
    assert.ok(!Cooldowns.isCooling("groq", t0 + 19 * MIN));
    Cooldowns.success("groq");
    assert.equal(Cooldowns.mark("groq", "RATE_LIMIT", t0) - t0, 2 * MIN);
});

test("exhausted key pool parks a provider for 30 min; saving a key clears it", () => {
    store.clear();
    const t0 = 9_000_000;
    assert.equal(Cooldowns.mark("groq", "KEYS_EXHAUSTED", t0) - t0, 30 * 60_000);
    assert.ok(Cooldowns.isCooling("groq", t0 + 1000));
    Cooldowns.clear("groq");
    assert.ok(!Cooldowns.isCooling("groq", t0 + 1000));
});

test("a server without a key for a provider parks it for 30 min", () => {
    Cooldowns.clearAll();
    const now = 1_000_000;
    const until = Cooldowns.mark("gemini", "NO_KEY", now);
    assert.equal(until - now, 30 * 60 * 1000);
    assert.equal(Cooldowns.reason("gemini"), "NO_KEY");
    Cooldowns.clearAll();
});
