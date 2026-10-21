---
name: write-tests
description: >-
  Bir değişiklik kümesi için test yazar. Kullan: kullanıcı "testlerini yaz" /
  "buna test ekle" dediğinde; Ralph bir story'yi implement ettikten sonra; ya da
  bir dizi manuel değişiklikten sonra kapsama oluşturmak için. `--plan` ile
  sadece docs/qa/test-plan.md'yi üretir/senkronlar, test kodu yazmaz.
---

# write-tests

Değişen kodu **unit / e2e / atla** diye sınıflar, `docs/qa/test-plan.md`'yi
senkronlar, sonra testleri yazıp bir kez koşar.

## Girdi kaynağı (otomatik)
- `.ralph/@fix_plan.md` varsa → story'ler + AC oradan; sınıflama AC'ye dayanır.
- Yoksa → `git diff` (staged + unstaged + son commit). Argüman verilirse o aralık:
  `/write-tests HEAD~5..HEAD`.

## Adımlar
1. Değişen dosyaları davranış birimlerine ayır.
2. Her birimi sınıfla:
   - **unit** — saf mantık, fonksiyon, servis, endpoint davranışı, hesaplama,
     dönüşüm, hata yolu, sınır koşulu.
   - **e2e** — çok adımlı UI yolculuğu **ve** kritik (login, ödeme, ana akış).
     Mevcut bir spec bu yolculuğu kapsıyorsa onu **genişlet**, yeni dosya açma.
   - **mobil-e2e** — SADECE `.start-project/mobile-e2e/flows/` kuruluysa: kritik
     bir mobil akış (login, ödeme, ana ekran) **veya** `browse`'un görmediği bir
     native-seam davranışı (push, deep link, native config). Mevcut Maestro
     YAML'ini **genişlet**, yeni dosya açma. Kurulu değilse bu kova yok sayılır
     — mobil UI değişikliği normal **e2e** ya da **atla**'ya düşer.
   - **atla** — config, tip tanımı, üretilmiş kod, önemsiz glue. Nedenini yaz.
3. `docs/qa/test-plan.md`'yi senkronla (aşağıdaki kurallar). **`--plan` verildiyse
   burada dur.**
4. Sınıflamaya göre testleri yaz. Framework + dizin projeden tespit:
   - `.start-project/qa.conf` varsa `QA_UNIT_CMD` / `QA_E2E_CMD` / `QA_MOBILE_E2E_CMD`
     komutlarını kullan; mobil-e2e flow'ları `.start-project/mobile-e2e/flows/`.
   - Yoksa `package.json` / `composer.json` (vitest / jest / pest / phpunit /
     pytest / playwright) + mevcut test klasörü (`tests/`, `__tests__/`,
     kaynak yanındaki `*.spec.*`).
   - Sadece standart framework API'leri; özel helper yok. Testler basit, gerçekçi
     senaryo, tek bir davranışı doğrular.
5. **Sadece yeni yazdığın testleri** bir kez koş; yeşil ya da anlamlı-kırmızı
   olduğunu doğrula.
6. Değişikliğin **önceden var olan** bir testi kırdıysa → aşağıdaki triyaj.
7. Özet tablo bas: birim → kova → dosya → durum.

## Yapma
- Ürün koduna dokunma (test geçsin diye bile). Gerçek bir hata bulduysan RAPOR et,
  düzeltme.
- Geçen mevcut testleri yeniden yazma.
- Tautolojik / anlamsız test yazıp gate'i geçme.

## Değişikliğin mevcut bir testi kırdıysa (triyaj)
Kodun, önceki bir story'den kalan bir testi kırmızıya döndürdüyse — gate'i geçmek
için hemen ona dokunma, önce KARAR VER:
- **Yeni davranış AC'ye göre kasıtlı** → testi yeni doğru değere güncelle
  (beklenen değeri değiştir). Case silme, yeni case gerekiyorsa ekle.
- **AC bu değişikliği kapsamıyor** → soktuğun bir regresyon. Teste DOKUNMA,
  RAPOR et, kırmızı bırak.
- **Her durumda YASAK**: `.skip` / `xit` / silme / `toBe(x)` → `toBeDefined()`
  gibi gevşetme ile yeşile çekmek. Gate'i geçen ama hiçbir şey doğrulamayan
  test = tautoloji.

## docs/qa/test-plan.md
Story ID'ye (manuel modda tarihli changeset başlığına) göre anahtarlı tablo:

| ID | Kova | Notlar / case'ler | Durum |
|----|------|-------------------|-------|
| 1.1 | unit | fiyat hesabı; sıfır/negatif sınır | yazıldı |
| 3.2 | e2e | login akışı (auth.spec.ts genişletildi) | yazıldı |
| 4.1 | atla | sadece tip tanımı | — |
| 5.3 | mobil-e2e | push bildirim deep-link (login-flow.yaml genişletildi) | yazıldı |

Senkron kuralları:
- Zaten var olan satır → **olduğu gibi kalır** (elle `unit`→`e2e` yaptıysan korunur).
- Yeni ID → eklenir.
- `@fix_plan.md`'den çıkmış ID → `(removed)` işaretlenir.
- Aynı ID, AC metni değişmiş → `(AC değişti — gözden geçir)` bayrağı, otomatik ezme.
- `--rebuild` → tabloyu sıfırdan üret.
