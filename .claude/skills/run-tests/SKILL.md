---
name: run-tests
description: >-
  Projenin test/QA gate'ini çalıştırır ve sonucu düz dille raporlar. Kullan:
  "testleri koş" / "test et" / test koşumu bir subagent'a devredildiğinde.
  Kod DÜZELTMEZ — sadece koşar + raporlar.
---

# run-tests

## Komut
- `/run-tests` → `./qa --only=unit` (hızlı: unit).
- `/run-tests --full` → `./qa --full` (unit + smoke + e2e).
- `/run-tests --only=lint,unit` → `./qa`'ya aynen geçir.
- Projede `./qa` yoksa: framework'ü tespit edip doğrudan koş (`vitest run`,
  `pest`, `pytest -q`).

## Çıktı
1. Başlık: `PASS` ya da `FAIL: <n> test`.
2. Her başarısız test için:
   - `dosya:satır` + test adı
   - başarısız assertion (beklenen ↔ gerçek)
   - bir satır düz dil: "bu ne demek"
3. `--full` ise smoke / e2e bölümü ayrı başlıkta.

## Yapma
- Hiçbir dosyayı değiştirme — test de yazma, ürün kodu da düzeltme.
- Düzeltme istenirse: "Bu skill sadece koşar. Düzeltmek için `/write-tests` ya da
  elle." de.

## Subagent notu
Sınırlı iş: koş → raporla → bitti. Yeşil = başarı sinyali, ana context gerekmez.
