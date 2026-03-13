/**
 * Verify integrity of fetched data files.
 * Checks: record counts, no null fields, unique IDs, required fields present.
 *
 * Usage: npx tsx scripts/verify_data.ts
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

interface QuranVerse {
  surah: number;
  ayah: number;
  surah_name_en: string;
  surah_name_ar: string;
  arabic_text: string;
  english_text: string;
}

interface Hadith {
  collection: string;
  number: number;
  book: number;
  arabic_text: string;
  english_text: string;
  narrator_chain: string;
}

let errors = 0;

function check(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    errors++;
  } else {
    console.log(`  OK: ${msg}`);
  }
}

function verifyQuran() {
  console.log("\n--- Quran ---");
  const raw = readFileSync(join(DATA_DIR, "quran.json"), "utf-8");
  const verses: QuranVerse[] = JSON.parse(raw);

  check(verses.length === 6236, `Expected 6236 verses, got ${verses.length}`);

  const ids = new Set<string>();
  const surahs = new Set<number>();
  let nullFields = 0;
  for (const v of verses) {
    const key = `${v.surah}:${v.ayah}`;
    if (ids.has(key)) {
      console.error(`  DUPLICATE: ${key}`);
      errors++;
    }
    ids.add(key);
    surahs.add(v.surah);

    if (!v.surah || !v.ayah || !v.surah_name_en || !v.surah_name_ar || !v.arabic_text || !v.english_text) {
      nullFields++;
    }
  }
  check(nullFields === 0, `No null/empty fields (found ${nullFields})`);
  check(ids.size === verses.length, `All IDs unique (${ids.size}/${verses.length})`);
  check(surahs.size === 114, `114 surahs present (got ${surahs.size})`);

  check(verses[0].surah === 1 && verses[0].ayah === 1, "Starts with 1:1");
  check(
    verses[verses.length - 1].surah === 114,
    "Ends with surah 114"
  );
}

function verifyHadith(collection: string, expectedMin: number) {
  console.log(`\n--- ${collection} ---`);
  const raw = readFileSync(
    join(DATA_DIR, "hadith", `${collection}.json`),
    "utf-8"
  );
  const hadiths: Hadith[] = JSON.parse(raw);

  check(
    hadiths.length >= expectedMin,
    `Expected >=${expectedMin} hadiths, got ${hadiths.length}`
  );

  const ids = new Set<number>();
  let nullFields = 0;
  let badCollection = 0;

  for (const h of hadiths) {
    if (ids.has(h.number)) {
      console.error(`  DUPLICATE number: ${h.number}`);
      errors++;
    }
    ids.add(h.number);

    if (h.collection !== collection) badCollection++;
    if (!h.number || !h.arabic_text || !h.english_text) nullFields++;
  }

  check(badCollection === 0, `All collection fields match "${collection}" (${badCollection} mismatches)`);
  check(nullFields === 0, `No null/empty required fields (found ${nullFields})`);
  check(ids.size === hadiths.length, `All numbers unique (${ids.size}/${hadiths.length})`);
}

function main() {
  console.log("Verifying data integrity...\n");

  try {
    verifyQuran();
  } catch (e) {
    console.error(`Failed to verify Quran: ${e}`);
    errors++;
  }

  try {
    verifyHadith("bukhari", 7000);
  } catch (e) {
    console.error(`Failed to verify Bukhari: ${e}`);
    errors++;
  }

  try {
    verifyHadith("muslim", 7000);
  } catch (e) {
    console.error(`Failed to verify Muslim: ${e}`);
    errors++;
  }

  console.log(`\n${"=".repeat(40)}`);
  if (errors > 0) {
    console.error(`${errors} error(s) found!`);
    process.exit(1);
  } else {
    console.log("All checks passed!");
  }
}

main();
