#!/usr/bin/env node
/**
 * scripts/i18n/sync-locales.mjs
 *
 * Reads en.json and propagates missing keys to all 40 locale files.
 * - Missing key in a locale  → fill with en.json value (placeholder)
 * - Extra key in a locale    → delete (preserve sorted order of remaining keys)
 * - Existing key              → leave untouched (don't overwrite translations)
 *
 * After writing, runs the validator to ensure all locales remain valid.
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "../../ui/src/i18n/locales");

// --- helpers ---------------------------------------------------------------

function readJson(filepath) {
  return JSON.parse(readFileSync(filepath, "utf8"));
}

function writeJson(filepath, data) {
  // Sort keys for clean diffs.
  writeFileSync(filepath, JSON.stringify(sortKeys(data), null, 2) + "\n", "utf8");
}

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

function deepMerge(target, source) {
  // Fill missing keys in target with source values, but never overwrite existing
  // values in target.
  for (const key of Object.keys(source)) {
    if (!(key in target)) {
      target[key] = source[key];
    } else if (
      typeof source[key] === "object" &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    }
    // Arrays: leave target's existing entries alone.
  }
  return target;
}

// --- validation (inline, no dependency on ui build) -------------------------

const MAX_STRING_LENGTH = 2000;

function interpolationPlaceholders(value) {
  return Array.from(value.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g), (m) => m[1]).sort();
}

function validateLocale(candidate, englishReference, locale) {
  const errors = [];
  validateNode([], candidate, englishReference, errors, locale);
  return errors;
}

function validateNode(path, candidate, englishRef, errors, locale) {
  if (typeof englishRef === "string") {
    if (typeof candidate !== "string") {
      errors.push(`${path.join(".")} must be a string`);
      return;
    }
    const candidatePlaceholders = interpolationPlaceholders(candidate);
    const englishPlaceholders = interpolationPlaceholders(englishRef);
    if (candidatePlaceholders.join("\0") !== englishPlaceholders.join("\0")) {
      errors.push(
        `${path.join(".")} interpolation placeholders must match English exactly: expected ${JSON.stringify(englishPlaceholders)}, received ${JSON.stringify(candidatePlaceholders)}`,
      );
    }
    const relativeLimit = Math.max(englishRef.length * 4 + 64, englishRef.length + 128);
    const lengthLimit = Math.min(MAX_STRING_LENGTH, relativeLimit);
    if (candidate.length > lengthLimit) {
      errors.push(`${path.join(".")} is too long: ${candidate.length} chars exceeds ${lengthLimit}`);
    }
    return;
  }

  if (typeof englishRef !== "object" || englishRef === null || Array.isArray(englishRef)) {
    errors.push(`${path.join(".")} has unsupported English reference type`);
    return;
  }

  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    errors.push(`${path.join(".")} must be an object`);
    return;
  }

  const englishKeys = Object.keys(englishRef).sort();
  const candidateKeys = Object.keys(candidate).sort();
  const missingKeys = englishKeys.filter((k) => !candidateKeys.includes(k));
  const extraKeys = candidateKeys.filter((k) => !englishKeys.includes(k));

  for (const key of missingKeys) {
    errors.push(`${[...path, key].join(".")} is missing`);
  }
  for (const key of extraKeys) {
    errors.push(`${[...path, key].join(".")} is not defined in English`);
  }

  for (const key of englishKeys) {
    if (key in candidate) {
      validateNode([...path, key], candidate[key], englishRef[key], errors, locale);
    }
  }
}

// --- main ------------------------------------------------------------------

const en = readJson(join(LOCALES_DIR, "en.json"));
const localeFiles = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json"));

console.log(`Syncing ${localeFiles.length} locales from en.json ...\n`);

for (const file of localeFiles) {
  const filepath = join(LOCALES_DIR, file);
  const locale = file.replace(/\.json$/, "");
  const messages = readJson(filepath);

  const original = JSON.stringify(messages);
  deepMerge(messages, en); // fill missing keys only
  const changed = JSON.stringify(messages) !== original;

  if (locale === "en") {
    // en.json is the source of truth — don't write it (it was read as-is).
    continue;
  }

  writeJson(filepath, messages);

  // Validate.
  const errs = validateLocale(readJson(filepath), en, locale);
  if (errs.length > 0) {
    console.error(`✗ ${file} validation failed:`);
    errs.forEach((e) => console.error("  ", e));
    process.exit(1);
  }

  if (changed) {
    console.log(`  synced: ${file} (+keys filled from en)`);
  } else {
    console.log(`  ok:     ${file}`);
  }
}

console.log("\nAll locales valid ✓");
