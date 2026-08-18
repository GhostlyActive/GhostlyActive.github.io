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
