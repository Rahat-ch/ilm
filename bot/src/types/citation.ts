export interface QuranVerse {
  surah: number;
  ayah: number;
  surah_name_en: string;
  surah_name_ar: string;
  arabic_text: string;
  english_text: string;
}

export interface Hadith {
  collection: "bukhari" | "muslim";
  number: number;
  book: number;
  arabic_text: string;
  english_text: string;
  narrator_chain: string;
}

export interface QuranCitation {
  type: "quran";
  surah: number;
  ayah: number;
}

export interface HadithCitation {
  type: "hadith";
  collection: "bukhari" | "muslim";
  number: number;
}

export type Citation = QuranCitation | HadithCitation;

export interface AgentResponse {
  summary: string;
  citations: Citation[];
  is_fatwa_request: boolean;
  no_relevant_content: boolean;
}
