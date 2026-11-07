#!/usr/bin/env node

/**
 * CLI for encrypting / decrypting config values in `.env.*` files.
 *
 * No dependencies beyond Node built-ins.
 *
 * Usage:
 *   node scripts/config-crypto.mjs generate-key
 *   node scripts/config-crypto.mjs encrypt  --file <path> --key-file <path> [--pattern <regex>]
 *   node scripts/config-crypto.mjs decrypt  --file <path> --key-file <path>
 *   node scripts/config-crypto.mjs rekey    --file <path> --old-key-file <path> --new-key-file <path>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENC_PREFIX = "ENC(";
const ENC_SUFFIX = ")";

const DEFAULT_PATTERN =
  "PASSWORD|SECRET|KEY|TOKEN|JWT|DSN|CREDENTIAL|PRIVATE|AUTH|STRIPE|TWILIO|FIREBASE|MPESA|OPENAI|AWS";

const isEncrypted = (v) => v.startsWith(ENC_PREFIX) && v.endsWith(ENC_SUFFIX);

function encrypt(plaintext, key) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${Buffer.concat([iv, enc, tag]).toString("base64")}${ENC_SUFFIX}`;
}

function decrypt(encoded, key) {
  const b64 = encoded.slice(ENC_PREFIX.length, -ENC_SUFFIX.length);
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}

function readKey(path) {
  const hex = readFileSync(path, "utf8").trim();
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    console.error(
      `Key file must contain exactly 64 hex characters (32 bytes), got ${hex.length} chars`,
    );
    process.exit(1);
  }
  return buf;
}

// A value may span several lines when it is quoted, as the RSA keys in
// configs/*/.env.production do. Parsing line-by-line truncated those to their first
// line and re-quoted it (`JWT_PRIVATE_KEY=""-----BEGIN PRIVATE KEY-----"`), destroying
// the key; base64 padding also made continuation lines look like `key=value`. So:
// only a well-formed key starts an entry, and an unbalanced opening quote consumes
// following lines until it closes.
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseEnvFile(content) {
  const lines = [];
  const raws = content.split("\n");

  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    const trimmed = raw.trimEnd();

    if (!trimmed || trimmed.startsWith("#")) {
      lines.push({ type: "other", raw });
      continue;
    }

    const eq = trimmed.indexOf("=");
    const key = eq === -1 ? "" : trimmed.slice(0, eq);
    if (eq === -1 || !KEY_RE.test(key)) {
      lines.push({ type: "other", raw });
      continue;
    }

    let value = trimmed.slice(eq + 1);
    let rawText = raw;
    const quote = value[0];

    if (
      (quote === '"' || quote === "'") &&
      !(value.length > 1 && value.endsWith(quote))
    ) {
      while (i + 1 < raws.length) {
        i++;
        rawText += "\n" + raws[i];
        value += "\n" + raws[i].trimEnd();
        if (raws[i].trimEnd().endsWith(quote)) break;
      }
    }

    let quoted = false;
    if (
      value.length > 1 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
      quoted = true;
    }

    lines.push({ type: "kv", key, value, quoted, raw: rawText });
  }
  return lines;
}

// Untouched entries are written back byte for byte. Re-serializing every line churned
// quoting the tool never needed to change (`JWT_ALGORITHM="RS256"` -> `RS256`), which
// buried the real diff and risked altering values it was not asked to touch.
function serializeEnvFile(lines) {
  return lines
    .map((l) => {
      if (l.type !== "kv" || !l.dirty) return l.raw;
      // Keep the quoting the file already used, so decrypt restores the original bytes.
      const needsQuote =
        l.quoted ||
        l.value.includes(" ") ||
        l.value.includes('"') ||
        l.value.includes("\n") ||
        l.value.startsWith("ENC(");
      return needsQuote ? `${l.key}="${l.value}"` : `${l.key}=${l.value}`;
    })
    .join("\n");
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

const args = process.argv.slice(2);
const command = args[0];

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

async function main() {
  if (command === "generate-key") {
    console.log(randomBytes(32).toString("hex"));
    return;
  }

  if (command === "encrypt") {
    const file = flag("file");
    const keyFile = flag("key-file");
    if (!file || !keyFile) {
      console.error("Usage: encrypt --file <path> --key-file <path> [--pattern <regex>]");
      process.exit(1);
    }
    const key = readKey(keyFile);
    const pattern = new RegExp(flag("pattern") || DEFAULT_PATTERN, "i");
    const content = readFileSync(file, "utf8");
    const lines = parseEnvFile(content);

    let count = 0;
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    for (const line of lines) {
      if (line.type !== "kv") continue;
      if (isEncrypted(line.value)) continue;
      if (!pattern.test(line.key)) continue;

      const preview = line.value.length > 40
        ? line.value.slice(0, 37) + "..."
        : line.value;
      const answer = await ask(rl, `Encrypt ${line.key} (${preview})? [Y/n] `);
      if (answer.toLowerCase() === "n") continue;

      line.value = encrypt(line.value, key);
      line.dirty = true;
      count++;
    }

    rl.close();
    writeFileSync(file, serializeEnvFile(lines));
    console.log(`Encrypted ${count} value(s) in ${file}`);
    return;
  }

  if (command === "decrypt") {
    const file = flag("file");
    const keyFile = flag("key-file");
    if (!file || !keyFile) {
      console.error("Usage: decrypt --file <path> --key-file <path>");
      process.exit(1);
    }
    const key = readKey(keyFile);
    const content = readFileSync(file, "utf8");
    const lines = parseEnvFile(content);

    let count = 0;
    for (const line of lines) {
      if (line.type !== "kv") continue;
      if (!isEncrypted(line.value)) continue;
      line.value = decrypt(line.value, key);
      line.dirty = true;
      count++;
    }

    writeFileSync(file, serializeEnvFile(lines));
    console.log(`Decrypted ${count} value(s) in ${file}`);
    return;
  }

  if (command === "rekey") {
    const file = flag("file");
    const oldKeyFile = flag("old-key-file");
    const newKeyFile = flag("new-key-file");
    if (!file || !oldKeyFile || !newKeyFile) {
      console.error(
        "Usage: rekey --file <path> --old-key-file <path> --new-key-file <path>",
      );
      process.exit(1);
    }
    const oldKey = readKey(oldKeyFile);
    const newKey = readKey(newKeyFile);
    const content = readFileSync(file, "utf8");
    const lines = parseEnvFile(content);

    let count = 0;
    for (const line of lines) {
      if (line.type !== "kv") continue;
      if (!isEncrypted(line.value)) continue;
      const plain = decrypt(line.value, oldKey);
      line.value = encrypt(plain, newKey);
      line.dirty = true;
      count++;
    }

    writeFileSync(file, serializeEnvFile(lines));
    console.log(`Re-encrypted ${count} value(s) in ${file}`);
    return;
  }

  console.error(
    "Commands: generate-key, encrypt, decrypt, rekey\n" +
      "Run with no arguments for help.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
