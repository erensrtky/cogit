# Agent-driven browser workflow (`browse` MCP)

`.start-project/browse`, `.mcp.json` üzerinden bir MCP server olarak bağlı.
Tool'lar: `navigate` `read_console` `read_network` `screenshot` `eval` `click`
`type` `wait_for`. Chrome'u ilk tool çağrısında kendisi headless açar; qa.conf'ta
`QA_E2E_BASE_URL` ayarlıysa `navigate` göreli yol alır (`/login`).

Bu, **deterministik smoke gate'ten (`./qa --full`) FARKLI**: smoke otomatik
kırmızı/yeşil verir; bu, senin bir değişikliği ELLE deneyip gözlemlemen içindir.

## Ne zaman kullan
Tarayıcıda render olan bir şeyi değiştirdiğinde — route, sayfa, component, form
akışı, client-side state, API çağrısı — **"done" demeden önce**:
1. `navigate` ile etkilenen route('lar)a git.
2. Değişikliğin davranışını sür: `click` / `type` / `wait_for` ile akışı taklit
   et (login değiştiyse giriş yap, filtre değiştiyse filtrele, …).
3. `read_console` (error + yakalanmamış exception) ve `read_network` (başarısız
   istek) temiz mi bak. Gerekirse `screenshot`, `eval` ile DOM/state doğrula.

## Kurallar
- Sadece "sayfa açıldı" yeterli değil — değiştirdiğin etkileşimi gerçekten sür.
- Console error / net fail / exception varsa: düzelt ya da neden kabul edilebilir
  olduğunu açıkça yaz. Sessiz geçme.
- `browse` oturumu Claude Code session'ı boyunca ayakta; ephemeral profil (her
  session sıfırdan, kalıcı login yok). Korumalı route için `QA_E2E_EXTRA_HEADERS`
  / `QA_E2E_STORAGE_STATE` (qa.conf) ya da login formunu `type`/`click` ile geç.
