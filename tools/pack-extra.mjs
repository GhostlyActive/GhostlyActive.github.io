/**
 * Encrypts secret/extra.json into assets/data/extra.enc.
 *
 * The repository is public, so the unlisted video IDs cannot sit in it in the
 * clear — the ciphertext can, the key cannot. The key is printed once and
 * belongs in the URL fragment, which browsers never send to a server.
 *
 *   node tools/pack-extra.mjs            reuse the key from secret/extra.key
 *   node tools/pack-extra.mjs --new-key  roll a new key, invalidating old links
 */
import { webcrypto as crypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const SOURCE = "secret/extra.json";
const KEY_FILE = "secret/extra.key";
const OUTPUT = "assets/data/extra.enc";

const base64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64url = (text) =>
  new Uint8Array(Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64"));

async function loadKey() {
  if (!process.argv.includes("--new-key") && existsSync(KEY_FILE)) {
    return fromBase64url((await readFile(KEY_FILE, "utf8")).trim());
  }
  // 128 bit, not 256: the ciphertext is public, so the only attack is offline
  // brute force, and 2^128 ends that argument. It also halves the link.
  const fresh = crypto.getRandomValues(new Uint8Array(16));
  await writeFile(KEY_FILE, base64url(fresh) + "\n");
  return fresh;
}

const source = JSON.parse(await readFile(SOURCE, "utf8"));

/**
 * A card that is missing a field throws inside extra.js, and the catch there
 * swallows it — the whole reel would then stay invisible with no clue why. A
 * topic that no chip declares is quieter still: the card renders but no filter
 * can reach it. Both are caught here instead, before anything ships.
 */
function validate(cards, markup) {
  const declared = new Set(
    (markup.match(/data-filter="#studio-grid"[\s\S]*?data-topics="([^"]+)"/) ?? [, ""])[1]
      .replaceAll("&amp;", "&")
      .split("|"),
  );

  const problems = [];
  cards.forEach((card, index) => {
    const where = `card ${index + 1} (${card.title ?? card.id ?? "unnamed"})`;
    for (const field of ["id", "title", "topics", "tags"]) {
      if (!card[field] || card[field].length === 0) problems.push(`${where}: "${field}" is missing`);
    }
    for (const topic of card.topics ?? []) {
      if (!declared.has(topic)) problems.push(`${where}: topic "${topic}" has no chip in index.html`);
    }
  });

  const seen = new Set();
  for (const card of cards) {
    if (seen.has(card.id)) problems.push(`video id ${card.id} appears twice`);
    seen.add(card.id);
  }
  return problems;
}

const problems = validate(source.cards, await readFile("index.html", "utf8"));
if (problems.length > 0) {
  console.error(`${problems.length} problem(s), nothing written:\n  ` + problems.join("\n  "));
  process.exit(1);
}

const payload = { cards: source.cards };

const raw = await loadKey();
const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);

// A fresh IV every run: reusing one with the same key breaks GCM outright.
const iv = crypto.getRandomValues(new Uint8Array(12));
const cipher = new Uint8Array(
  await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))),
);

const blob = new Uint8Array(iv.length + cipher.length);
blob.set(iv);
blob.set(cipher, iv.length);
await writeFile(OUTPUT, Buffer.from(blob).toString("base64"));

console.log(`${payload.cards.length} Karten verschlüsselt -> ${OUTPUT} (${blob.length} Bytes)`);
console.log(`\nLink:\n  https://ghostlyactive.github.io/#k=${base64url(raw)}\n`);
console.log(`Schlüssel liegt in ${KEY_FILE} — die Datei gehört nicht ins Repo.`);
