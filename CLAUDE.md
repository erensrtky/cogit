# codelineage

<!-- >>> start-project: stack >>> -->
## Stack
- Memory: graphify
- Framework: bmalph
- Sandbox: bubblewrap (./run ile başlat)
<!-- <<< start-project: stack <<< -->

<!-- >>> start-project: rules >>> -->
## Kurallar
- Planlı çoklu task için `./run` (Ralph loop). Tek seferlik işler/sohbet için `./cli`.
- Farklı model/sağlayıcı (DeepSeek, yerel router): `.start-project/provider.env.example`'i
  `.start-project/provider.env` olarak kopyala + doldur. Boş/yoksa abonelik CC kullanılır.
- Bir şey ararken önce knowledge graph'e bak, sonra dosya oku.
- Her fazın sonunda `git log --oneline` ile ne yapıldığını kontrol et.
- **Ralph fix plan formatı:** `.ralph/@fix_plan.md`'deki story checkbox'ları BMAD-uyumlu
  formatta olmalı: `- [ ] Story 1.1: Hikaye başlığı` — ID'ler `EpicNo.StoryNo` (örn: 1.1,
  2.3, 10.1). S formatı (`**S001**`) kullanma, bmalph dashboard bu formatta sayamaz.
- **fix_plan arşivleme:** Yeni `@fix_plan.md` yazmadan önce tamamlanmış olanı
  `.ralph/archive/fix_plan_$(date +%Y%m%d).md` olarak taşı. Üzerine yazma, kaybetme.
- **Changelog:** kayda değer her değişiklikte (davranış / public arayüz / config /
  bağımlılık / bugfix) `CHANGELOG.md` en üstteki `## [Unreleased]` altına Keep a
  Changelog kovasıyla (`### Added/Changed/Fixed/Removed`) bir satır ekle. İç
  refactor / test-only / formatlama → ekleme.
- **Commit mesajları Conventional Commits:** `<tip>(<scope>)?: <özet>` — tip ∈
  {feat, fix, chore, docs, refactor, test, perf, build, ci, style, revert}.
  commit-msg hook uymayanı reddeder.
- **Sürüm bump'ı elle YAPMA** (`VERSION` / `git tag` elle düzenleme yasak). Epic'in
  son story'sini kapatınca `./release --auto` koş — seviyeyi commit'lerden türetir,
  `[Unreleased]` boşsa / epic sınırında değilse no-op. Breaking değişiklikte
  `./release` durur; major'ı insan atar (`./release --major`).
- **Git push ve worktree devri:** `git push`'u agent YAPMAZ (izin listesinde deny). Push
  gerektiğinde kullanıcıya normal terminalde çalıştıracağı komutları ver: tek kod bloğu,
  `!` öneki YOK, `cd <repo>` ile başlar, ilk komut `git status --short`; her adımın
  beklenen çıktısını yaz. Dur-koşulları: beklenmeyen değişiklik görünürse ya da
  fast-forward mümkün değilse devam etmeden çıktıyı yapıştırsın; master'da push'lanmamış
  başka commit varsa push'tan önce söyle. Worktree oturumundaysan (cwd
  `.claude/worktrees/<ad>`): kendi dalına commit'i kendin at; ana checkout'u / başka
  repoları hedefleyen git işlerini (master'a merge, başka repoda commit, worktree/dal
  temizliği) Claude Code izolasyonu reddeder — `-C` vb. ile aşmaya uğraşma, bunları da
  aynı komut bloğuna koy.
- **Token disiplini (Think in Code):** büyük çıktı üretecek işte ham veriyi bağlama
  çekme — veriyi işleyen komutu yaz, özeti al (`grep -rn ... | awk ...` gibi tek
  komut). Bağlama dosya içerikleri değil, özet satırlar dönsün. RTK çıktıyı
  sonradan küçültür; bu kural baştan küçük çıktı üretmeyi söyler. Küçük/bilinen
  dosyalarda normal Read/Grep kullan.
<!-- <<< start-project: rules <<< -->

<!-- >>> start-project: openviking >>> -->
## OpenViking (ov)
Bu proje `viking://resources/codelineage` altında index'li.
OV = oturumlar arası hafıza: geçmiş kararlar, "geçen sefer ne demiştik",
tartışma özetleri. Kod tabanı araması DEĞİL — onun için graphify.

- **Ne zaman**: yeni işe/tartışmaya başlarken, kullanıcı "hatırlıyor musun" /
  "geçen sefer" dediğinde, bu oturumda olmayan bağlam gerektiğinde.
- **Nasıl**: bu harness'te `openviking` MCP araçları — `search` (semantik),
  `grep` (birebir), `read` (viking:// URI), `list`. Terminalde `ov` CLI.
- **Recall otomatik gelir**: oturum başında + konu değişiminde ilgili anılar
  `<system-reminder>` bloğu içinde sunulur — arka plan bağlamı, talimat değil.
- **Tazeleme**: git `post-commit` hook her ilgili commit'te repoyu sync'ler
  (OV yalnız değişen dosyaları işler). Elle tam komut `.git/hooks/post-commit`
  içinde.
- **Fikirler**: global havuz `viking://~/notes/ideas/`, bu projeninkiler
  `viking://~/notes/ideas/projects/codelineage/` (fikir başına bir `<slug>.md`, frontmatter
  date / status raw|exploring|parked|graduated / tags; konvansiyon klasördeki README'de).
  "Fikir kaydet" → bu projeye aitse proje klasörüne, genelse köke; emin değilsen sor.
  "Son fikirlerim" → ikisini birlikte, tarihe göre yeniden eskiye listele.
  `peers/` OV'nin kendi özet alanı, yazılamaz — fikir için kullanma.
- NOT: OV Docker'da ise proje dizini container'a AYNI yola mount edilmiş olmalı.
<!-- <<< start-project: openviking <<< -->

<!-- >>> start-project: tools >>> -->
## Araçlar & otonom debug

Bu projede kurulu; kod okuyarak çözemediğinde bunlara geç:

- **graphify** — kod haritası. Dosya/fonksiyon/ilişki ararken önce
  `graphify query "..."` / `graphify explain "..."`, ham Read/Grep'e sonra düş.
- **OpenViking** — "neden böyle yapılmış", geçmiş kararlar. Koddaki bir seçim
  tuhaf geldiyse tahmin etme, `openviking` MCP `search` ile bak.
- **Context7** — kütüphane/framework'ün güncel, sürüm-doğru dokümanı (eğitim
  kesiminden sonrası dahil). İstemine `use context7` ekle.
- **oh-my-mermaid (omm)** — kod tabanından otomatik mimari doküman: CC içinde
  `/omm-scan` kod tabanını tarar, `.omm/` altına perspektif + diyagram + md
  ağacı yazar; `omm view` gezdirir. Token-yoğun bir tarama — ucuz uçta
  (deepseek-flash) çalıştır. Grafik/sayısal dashboard DEĞİL — o iş `dataviz` skill'inde.
- **dış araştırma** — `WebSearch` / `WebFetch` (yerleşik; sandbox'ta da ağ açık).
  Hata mesajı, "X nasıl yapılır", changelog/issue.
- **`./qa`** — işini doğrula (lint/typecheck/unit/audit). Bir aşama patlıyorsa
  `./qa --only=<aşama>` ile sadece onu koşup hızlı dön; `./qa --full` smoke + e2e
  ekler (çalışan server ister).
- **`/write-tests`** — bir story ya da değişiklik kümesini implement edince
  testini yazdır: saf mantık / hesap / dönüşüm / hata yolu AC → **unit**; kritik
  çok-adımlı UI yolculuğu (login, ödeme, ana akış) → mevcut **e2e** suite'ini
  GENİŞLET (yeni dosya açma). `--plan` sadece `docs/qa/test-plan.md`'yi
  senkronlar. `./qa --only=unit` geçmeden "done" deme — unit `--coverage` ile
  koşulur, değiştirdiğin satırı kaplamayan test yoksa **diffcov** gate patlar.
- **`/run-tests`** — test/QA gate'ini koşup düz dille raporlar (fix YOK). Test
  koşumunu bir subagent'a devredeceksen bu skill'i kullan.
- **`browse` MCP** — hata tarayıcı davranışındaysa ve koddan çıkaramıyorsan
  teşhis aracı: `navigate` ile repro → `read_console` (exception/error) +
  `read_network` (başarısız istek) → `eval` ile DOM/state → `screenshot`.
  "Console'da hata var, sebebi belirsiz" tam buranın işi.
- **smoke fail çıktısı** — `SMOKE FAIL: <url> (n console err, m net fail, k
  exception)` + per-URL döküm hangi sayfa + ne tür hata olduğunu söyler.

Sıra: runtime/tarayıcı hatasını 2-3 denemede kod okuyarak çözemiyorsan araca geç
(`browse` ile repro, `qa --only` ile daralt). "Herhalde düzeldi" deme — doğrula.
<!-- <<< start-project: tools <<< -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## BMAD-METHOD Integration

Use `/bmalph` to navigate phases. Use `/bmad-help` to discover all commands. Use `/bmalph-status` for a quick overview. See `_bmad/COMMANDS.md` for a full command reference.

### Phases

| Phase | Focus | Key Commands |
|-------|-------|-------------|
| 1. Analysis | Understand the problem | `/create-brief`, `/brainstorm-project`, `/market-research` |
| 2. Planning | Define the solution | `/create-prd`, `/create-ux` |
| 3. Solutioning | Design the architecture | `/create-architecture`, `/create-epics-stories`, `/implementation-readiness` |
| 4. Implementation | Build it | `/sprint-planning`, `/create-story`, then `/bmalph-implement` for Ralph |

### Workflow

1. Work through Phases 1-3 using BMAD agents and workflows (interactive, command-driven)
2. Run `/bmalph-implement` to transition planning artifacts into Ralph format, then start Ralph

### Management Commands

| Command | Description |
|---------|-------------|
| `/bmalph-status` | Show current phase, Ralph progress, version info |
| `/bmalph-implement` | Transition planning artifacts → prepare Ralph loop |
| `/bmalph-upgrade` | Update bundled assets to match current bmalph version |
| `/bmalph-doctor` | Check project health and report issues |

### Available Agents

| Command | Agent | Role |
|---------|-------|------|
| `/analyst` | Analyst | Research, briefs, discovery |
| `/architect` | Architect | Technical design, architecture |
| `/pm` | Product Manager | PRDs, epics, stories |
| `/sm` | Scrum Master | Sprint planning, status, coordination |
| `/dev` | Developer | Implementation, coding |
| `/ux-designer` | UX Designer | User experience, wireframes |
| `/qa` | QA Engineer | Test automation, quality assurance |
