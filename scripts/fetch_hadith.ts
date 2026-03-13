/**
 * Fetch Bukhari + Muslim hadith data from AhmedBaset/hadith-json (pinned commit).
 * Normalizes to our citation contract schema.
 * Outputs to data/hadith/bukhari.json and data/hadith/muslim.json
 *
 * Usage: npx tsx scripts/fetch_hadith.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PINNED_COMMIT = "ca32fd72aa16eeeb9a819c80bb65c9e78766532d";
const BASE_URL = `https://raw.githubusercontent.com/AhmedBaset/hadith-json/${PINNED_COMMIT}/db/by_book/the_9_books`;
const OUTPUT_DIR = join(__dirname, "..", "data", "hadith");

interface RawHadith {
  id: number;
  idInBook: number;
  chapterId: number;
  bookId: number;
  arabic: string;
  english: {
    narrator: string;
    text: string;
  };
}

interface RawBook {
  id: number;
  metadata: Record<string, unknown>;
  chapters: unknown[];
  hadiths: RawHadith[];
}

interface NormalizedHadith {
  collection: "bukhari" | "muslim";
  number: number;
  book: number;
  arabic_text: string;
  english_text: string;
  narrator_chain: string;
}

async function fetchCollection(
  name: "bukhari" | "muslim"
): Promise<NormalizedHadith[]> {
  const url = `${BASE_URL}/${name}.json`;
  console.log(`Fetching ${name} from ${url}...`);

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${name}: ${resp.status}`);

  const raw: RawBook = await resp.json();
  console.log(`${name}: ${raw.hadiths.length} hadiths`);

  const normalized = raw.hadiths.map((h) => ({
    collection: name,
    number: h.idInBook,
    book: h.chapterId,
    arabic_text: h.arabic,
    english_text:
      `${h.english.narrator} ${h.english.text}`.trim() ||
      "[English translation not available]",
    narrator_chain: h.english.narrator,
  }));

  const missing = normalized.filter((h) =>
    h.english_text === "[English translation not available]"
  );
  if (missing.length > 0) {
    console.log(`  ${missing.length} hadith(s) missing English translation`);
  }

  return normalized;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const [bukhari, muslim] = await Promise.all([
    fetchCollection("bukhari"),
    fetchCollection("muslim"),
  ]);

  writeFileSync(
    join(OUTPUT_DIR, "bukhari.json"),
    JSON.stringify(bukhari, null, 2),
    "utf-8"
  );
  writeFileSync(
    join(OUTPUT_DIR, "muslim.json"),
    JSON.stringify(muslim, null, 2),
    "utf-8"
  );

  console.log(`\nBukhari: ${bukhari.length} hadiths`);
  console.log(`Muslim: ${muslim.length} hadiths`);
  console.log(`Total: ${bukhari.length + muslim.length} hadiths`);
  console.log(`Pinned commit: ${PINNED_COMMIT}`);
}

main().catch(console.error);
