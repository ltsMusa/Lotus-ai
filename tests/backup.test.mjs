// Tests for backup & restore rules (js/backup.js).
// Run:  node --test tests/backup.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
    BACKUP_FORMAT,
    BACKUP_VERSION,
    LIMITS,
    backupFilename,
    buildBackup,
    parseBackup,
    pickRestorableSettings,
    fingerprint,
    planRestore,
    newMemories,
    describeRestore,
    backupReminderDue,
    REMINDER_EVERY_MS,
    BACKUP_STALE_MS
} from "../js/backup.js";

const GROQ = "gsk_" + "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5bC7dE9fG1hJ3kL5m".slice(0, 52);
const GEMINI = "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q";

const chat = (id, title, created, messages = [["user", "merhaba"], ["assistant", "selam"]]) => ({
    id,
    title,
    created_at: created,
    updated_at: created,
    messages: messages.map(([role, content], index) => ({ role, content, created_at: new Date(Date.parse(created) + index * 1000).toISOString() }))
});

const sample = () => [
    chat("b", "İkinci", "2026-10-02T10:00:00.000Z"),
    chat("a", "Birinci", "2026-10-01T10:00:00.000Z"),
    { id: "empty", title: "Boş", created_at: "2026-10-03T10:00:00.000Z", updated_at: "2026-10-03T10:00:00.000Z", messages: [] }
];

test("the file name carries the local date", () => {

    assert.equal(backupFilename(new Date(2026, 10, 5, 23, 59)), "lotus-yedek-2026-11-05.json");
    assert.equal(backupFilename(new Date(2026, 0, 9)), "lotus-yedek-2026-01-09.json");
});

test("buildBackup: oldest first, empty chats left out, pins kept, keys only on request", () => {

    const backup = buildBackup({
        conversations: sample(),
        pinnedIds: new Set(["b"]),
        memories: [{ content: "Kahveyi sütsüz içerim", category: "preference", importance: 3 }],
        settings: { theme: "midnight", personalization: { nickname: "Musa" } },
        keys: { groq: GROQ, gemini: GEMINI, openai: "sk-nope" },
        now: new Date("2026-11-05T10:00:00Z"),
        appVersion: "7.1-beta"
    });

    assert.equal(backup.format, BACKUP_FORMAT);
    assert.equal(backup.version, BACKUP_VERSION);
    assert.equal(backup.created_at, "2026-11-05T10:00:00.000Z");
    assert.equal(backup.app, "7.1-beta");
    assert.deepEqual(backup.conversations.map(c => c.id), ["a", "b"]);
    assert.deepEqual(backup.conversations.map(c => c.pinned), [false, true]);
    assert.equal(backup.keys, undefined, "no key is written unless asked for");
    assert.deepEqual(backup.settings, { personalization: { nickname: "Musa" }, theme: "midnight" });
    assert.ok(!JSON.stringify(backup).includes(GROQ));

    const withKeys = buildBackup({ conversations: sample(), keys: { groq: GROQ, gemini: "AIza-too-short", openai: "sk-x" }, includeKeys: true });

    assert.deepEqual(withKeys.keys, { groq: GROQ }, "only well-formed Groq/Gemini keys");
});

test("a backup survives a trip through JSON unchanged", () => {

    const built = buildBackup({
        conversations: sample(),
        pinnedIds: ["a"],
        memories: [{ content: "Tatlıyı severim", category: "preference", importance: 2 }],
        settings: { image: { aspect: "wide", style: "anime", enhance: false }, voice: { rate: 1.1 } },
        keys: { gemini: GEMINI },
        includeKeys: true,
        now: new Date("2026-11-05T10:00:00Z")
    });

    const parsed = parseBackup(JSON.stringify(built));

    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.backup.conversations, built.conversations);
    assert.deepEqual(parsed.backup.memories, built.memories);
    assert.deepEqual(parsed.backup.settings, built.settings);
    assert.deepEqual(parsed.backup.keys, { gemini: GEMINI });
    assert.deepEqual(parsed.stats, {
        skippedConversations: 0, skippedMessages: 0, skippedMemories: 0,
        conversations: 2, messages: 4, memories: 1, hasSettings: true, hasKeys: true
    });
});

test("parseBackup refuses what is not a backup, with a reason", () => {

    assert.match(parseBackup("").error, /geçerli bir yedek değil/);
    assert.match(parseBackup("{not json").error, /geçerli bir yedek değil/);
    assert.match(parseBackup("[]").error, /Lotus AI yedek dosyası değil/);
    assert.match(parseBackup(JSON.stringify({ format: "other", version: 1 })).error, /Lotus AI yedek dosyası değil/);
    assert.match(parseBackup(JSON.stringify({ format: BACKUP_FORMAT })).error, /sürümü okunamadı/);
    assert.match(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1 })).error, /güncelle/);
    assert.match(parseBackup("x".repeat(LIMITS.fileChars + 1)).error, /çok büyük/);

    // a valid, empty backup is fine
    assert.equal(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1 })).ok, true);
});

test("parseBackup repairs what it can and drops what it cannot", () => {

    const raw = {
        format: BACKUP_FORMAT,
        version: 1,
        conversations: [
            "not an object",
            { id: "x", title: "Sağlam", created_at: "2026-10-01T10:00:00Z", messages: [
                { role: "user", content: "soru" },
                { role: "robot", content: "geçersiz rol" },
                { role: "assistant", content: "   " },
                { role: "assistant", content: 42 },
                { role: "assistant", content: "cevap", created_at: "garbage" },
                null
            ] },
            { id: "x", title: "Aynı kimlik", created_at: "2026-10-02T10:00:00Z", messages: [{ role: "user", content: "bir daha" }] },
            { title: "Kimliksiz", messages: [{ role: "user", content: "merhaba" }] },
            { id: "y", title: "Mesajsız", messages: [] },
            { id: "z", title: "t".repeat(500), created_at: "2026-10-03T10:00:00Z", messages: [{ role: "user", content: "k".repeat(LIMITS.contentChars + 1) }, { role: "user", content: "kısa" }] }
        ]
    };

    const result = parseBackup(JSON.stringify(raw), { now: "2026-11-05T10:00:00.000Z" });

    assert.equal(result.ok, true);

    const { conversations } = result.backup;

    // "Sağlam": the bad messages are skipped, order is kept even for the message with no valid time
    assert.deepEqual(conversations[0].messages.map(m => m.content), ["soru", "cevap"]);
    assert.ok(Date.parse(conversations[0].messages[1].created_at) > Date.parse(conversations[0].messages[0].created_at));

    // one id twice → the second one is kept under another id, never merged or lost
    assert.equal(conversations[1].id, "x-3");
    assert.equal(conversations[1].title, "Aynı kimlik");

    // missing id → generated; missing dates → the import time
    assert.equal(conversations[2].id, "yedek-4");
    assert.equal(conversations[2].created_at, "2026-11-05T10:00:00.000Z");

    // title is cut, an oversized message is skipped but the chat stays
    assert.equal(conversations[3].title.length, LIMITS.titleChars);
    assert.deepEqual(conversations[3].messages.map(m => m.content), ["kısa"]);

    assert.equal(conversations.length, 4);
    assert.equal(result.stats.skippedConversations, 2, "the string and the empty chat");
    assert.equal(result.stats.skippedMessages, 5, "robot, blank, number, null and the oversized one");
});

test("parseBackup: memories, settings and keys are cleaned", () => {

    const raw = {
        format: BACKUP_FORMAT,
        version: 1,
        memories: [
            { content: "  Kediyi severim  ", category: "preference", importance: 9 },
            { content: "kediyi severim", category: "fact" },
            { content: "", category: "fact" },
            { content: "Proje: Lotus", category: "unknown", importance: "x" },
            { content: 5 }
        ],
        settings: {
            theme: "../../x",
            personalization: { nickname: "Musa", about: "a".repeat(5000), "__proto__": "x", "bad key": 1, nested: { a: 1 }, fn: () => 1 },
            image: { aspect: "wide", enhance: false },
            extra: { hacked: true }
        },
        keys: { groq: "gsk_short", gemini: GEMINI, other: "x" }
    };

    const { backup, stats } = parseBackup(JSON.stringify(raw));

    assert.deepEqual(backup.memories, [
        { content: "Kediyi severim", category: "preference", importance: 5 },
        { content: "Proje: Lotus", category: "general", importance: 1 }
    ]);
    assert.equal(stats.skippedMemories, 1, "the duplicate");

    assert.equal(backup.settings.theme, undefined, "theme ids are plain words");
    assert.equal(backup.settings.extra, undefined, "only known groups");
    assert.equal(backup.settings.personalization.nickname, "Musa");
    assert.equal(backup.settings.personalization.about.length, LIMITS.settingChars);
    assert.deepEqual(Object.keys(backup.settings.personalization).sort(), ["about", "nickname"]);
    assert.deepEqual(backup.settings.image, { aspect: "wide", enhance: false });

    assert.deepEqual(backup.keys, { gemini: GEMINI }, "only a well-formed key survives");
});

test("pickRestorableSettings tolerates anything", () => {

    assert.deepEqual(pickRestorableSettings(undefined), {});
    assert.deepEqual(pickRestorableSettings("x"), {});
    assert.deepEqual(pickRestorableSettings({ theme: "dark-2" }), { theme: "dark-2" });
    assert.deepEqual(pickRestorableSettings({ voice: { rate: Infinity, on: true } }), { voice: { on: true } });
});

test("planRestore skips what is already there — by id, or by title and start time", () => {

    const backup = parseBackup(JSON.stringify(buildBackup({ conversations: sample() }))).backup;

    // nothing there → everything is added
    let plan = planRestore([], backup);

    assert.equal(plan.add.length, 2);
    assert.equal(plan.skipped, 0);
    assert.equal(plan.messages, 4);

    // guest device: same ids
    plan = planRestore([{ id: "a", title: "x", created_at: "2000-01-01T00:00:00Z" }], backup);

    assert.deepEqual(plan.add.map(c => c.id), ["b"]);
    assert.equal(plan.skipped, 1);

    // signed-in account: the database gave other ids, but the same title and start time give it away
    plan = planRestore([{ id: "uuid-1", title: "  birinci ", created_at: "2026-10-01T10:00:00.123Z" }], backup);

    assert.deepEqual(plan.add.map(c => c.id), ["b"]);

    // restoring the same file again adds nothing
    const again = planRestore(backup.conversations.map(c => ({ id: c.id, title: c.title, created_at: c.created_at })), backup);

    assert.equal(again.add.length, 0);
    assert.equal(again.skipped, 2);

    // two entries of one file that look the same are added once
    const twin = { ...backup, conversations: [backup.conversations[0], { ...backup.conversations[0], id: "other" }] };

    assert.equal(planRestore([], twin).add.length, 1);

    assert.equal(fingerprint({ title: "A", created_at: "garbage" }), "a|?");
});

test("newMemories compares by text, ignoring case and spaces", () => {

    const have = [{ content: "Kediyi severim" }, { content: "  Proje: LOTUS " }];

    const incoming = [
        { content: "kediyi SEVERİM".replace("İ", "i"), category: "general", importance: 1 },
        { content: "proje: lotus", category: "general", importance: 1 },
        { content: "Yeni not", category: "fact", importance: 2 }
    ];

    assert.deepEqual(newMemories(have, incoming).map(m => m.content), ["Yeni not"]);
    assert.equal(newMemories([], incoming).length, 3);
});

test("describeRestore says plainly what will and will not happen", () => {

    const stats = { memories: 2, skippedMessages: 0, skippedConversations: 0 };

    const text = describeRestore({ stats, plan: { add: [1, 2, 3], skipped: 1, messages: 14 }, newMemoryCount: 1, willApplySettings: true, keysToAdd: 1 });

    assert.match(text, /3 sohbet \(14 mesaj\) eklenecek/);
    assert.match(text, /1 sohbet zaten var, atlanacak/);
    assert.match(text, /1 hafıza notu eklenecek/);
    assert.match(text, /kişiselleştirme ve tercihler yedekteki haline dönecek/);
    assert.match(text, /1 API anahtarı eklenecek/);
    assert.match(text, /Mevcut sohbetlerin ve notların hiçbiri silinmez ya da değiştirilmez\.$/);

    assert.match(describeRestore({ stats: { memories: 0, skippedMessages: 2, skippedConversations: 1 }, plan: { add: [], skipped: 0, messages: 0 } }), /^Eklenecek yeni sohbet yok\. \(2 mesaj ve 1 sohbet okunamadığı için atlandı\)/);
});

test("backupReminderDue: rare, only for guests who have something to lose", () => {

    const now = 1_800_000_000_000;

    assert.equal(backupReminderDue({ signedIn: false, conversationCount: 3, now }), true);
    assert.equal(backupReminderDue({ signedIn: true, conversationCount: 50, now }), false, "an account keeps them in the cloud");
    assert.equal(backupReminderDue({ signedIn: false, conversationCount: 2, now }), false);
    assert.equal(backupReminderDue({ signedIn: false, conversationCount: 9, lastBackupAt: now - 5 * 86400000, now }), false, "recent backup");
    assert.equal(backupReminderDue({ signedIn: false, conversationCount: 9, lastBackupAt: now - BACKUP_STALE_MS - 1, now }), true, "old backup");
    assert.equal(backupReminderDue({ signedIn: false, conversationCount: 9, lastReminderAt: now - 86400000, now }), false, "reminded yesterday");
    assert.equal(backupReminderDue({ signedIn: false, conversationCount: 9, lastReminderAt: now - REMINDER_EVERY_MS - 1, now }), true);
    // garbage and clocks that went backwards never block the reminder forever
    assert.equal(backupReminderDue({ signedIn: false, conversationCount: 9, lastBackupAt: "x", lastReminderAt: now + 1e9, now }), true);
});
