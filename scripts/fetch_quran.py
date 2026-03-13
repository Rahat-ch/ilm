"""
Fetch Quran data from alquran.cloud API (serves Tanzil.net data).
Downloads Uthmani Arabic text + Sahih International English translation.
Outputs merged data to data/quran.json.

Usage: python scripts/fetch_quran.py
"""

import json
import os
import sys
import urllib.request

ARABIC_URL = "https://api.alquran.cloud/v1/quran/quran-uthmani"
ENGLISH_URL = "https://api.alquran.cloud/v1/quran/en.sahih"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "quran.json")


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "ilm/0.1"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def main():
    print("Fetching Arabic text (Uthmani)...")
    arabic_data = fetch_json(ARABIC_URL)

    print("Fetching Sahih International translation...")
    english_data = fetch_json(ENGLISH_URL)

    if arabic_data["code"] != 200 or english_data["code"] != 200:
        print("API error. Check responses.")
        sys.exit(1)

    arabic_surahs = arabic_data["data"]["surahs"]
    english_surahs = english_data["data"]["surahs"]

    assert len(arabic_surahs) == len(english_surahs) == 114, (
        f"Surah count mismatch: Arabic={len(arabic_surahs)}, English={len(english_surahs)}"
    )

    verses = []
    for ar_surah, en_surah in zip(arabic_surahs, english_surahs):
        assert len(ar_surah["ayahs"]) == len(en_surah["ayahs"]), (
            f"Ayah count mismatch in surah {ar_surah['number']}: "
            f"Arabic={len(ar_surah['ayahs'])}, English={len(en_surah['ayahs'])}"
        )
        surah_num = ar_surah["number"]
        surah_name_ar = ar_surah["name"]
        surah_name_en = en_surah["englishName"]

        for ar_ayah, en_ayah in zip(ar_surah["ayahs"], en_surah["ayahs"]):
            verses.append({
                "surah": surah_num,
                "ayah": ar_ayah["numberInSurah"],
                "surah_name_en": surah_name_en,
                "surah_name_ar": surah_name_ar,
                "arabic_text": ar_ayah["text"],
                "english_text": en_ayah["text"],
            })

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(verses, f, ensure_ascii=False, indent=2)

    print(f"Written {len(verses)} verses to {OUTPUT_PATH}")
    print(f"Expected: 6236, Got: {len(verses)}")


if __name__ == "__main__":
    main()
