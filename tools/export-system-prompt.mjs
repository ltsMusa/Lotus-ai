// Copies the Lotus persona (js/prompts/systemPrompt.js) into the places that
// cannot import JavaScript:
//   • ollama/lotus-system-prompt.txt
//   • the generated block inside ollama/termux-kurulum.sh
//
// Run after editing the prompt:   node tools/export-system-prompt.mjs
// (tests/personalization.test.mjs fails when these copies are out of date)
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { LOTUS_SYSTEM_PROMPT } = await import("../js/prompts/systemPrompt.js");

const BEGIN = "# >>> LOTUS_SYSTEM_PROMPT (otomatik üretilir: node tools/export-system-prompt.mjs)";
const END = "# <<< LOTUS_SYSTEM_PROMPT";
const DELIMITER = "LOTUS_PROMPT_EOF";

if (LOTUS_SYSTEM_PROMPT.includes(DELIMITER) || LOTUS_SYSTEM_PROMPT.includes('"""')) {

    throw new Error("Prompt metni betiği bozacak bir dizi içeriyor (LOTUS_PROMPT_EOF veya üç tırnak).");
}

await writeFile(join(root, "ollama", "lotus-system-prompt.txt"), `${LOTUS_SYSTEM_PROMPT}\n`);

const scriptPath = join(root, "ollama", "termux-kurulum.sh");

let script = await readFile(scriptPath, "utf8");

const block = `${BEGIN}
cat > "$LOTUS_PROMPT" <<'${DELIMITER}'
${LOTUS_SYSTEM_PROMPT}
${DELIMITER}
${END}`;

const start = script.indexOf(BEGIN);
const end = script.indexOf(END);

if (start === -1 || end === -1) throw new Error("termux-kurulum.sh içinde prompt bloğu işaretleri yok.");

script = script.slice(0, start) + block + script.slice(end + END.length);

await writeFile(scriptPath, script);

console.log("Prompt ollama/lotus-system-prompt.txt ve ollama/termux-kurulum.sh içine yazıldı.");
