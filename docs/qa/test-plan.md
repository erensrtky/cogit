# Test plan

| ID | Kova | Notlar / case'ler | Durum |
|----|------|-------------------|-------|
| 2.6 | unit | `outlinePath`: epoch → epoch, session → epoch, nested node → tam ancestor zinciri, unassigned grubu, bilinmeyen id. Outline UI akışı (toggle, grafik odağı, drill-down, console) `browse` MCP ile `file://` üzerinde elle doğrulandı; template UI için otomatik e2e harness yok. | yazıldı |
| 2026-10-26 fixes | unit | git hook bloğu: PATH'te `cogit` yoksa kurulan CLI `node` ile, ikisi de yoksa sessiz (gerçek `sh` koşumu); `refreshGitHooks` yalnız mevcut bloğu yeniler + UserPromptSubmit çağırır; `hooks install`; ignore politikasında da hook (init, `config git`, migrasyon) ve trailer; pre-commit `project.json` + `.cogit/.gitignore`'ı da ekler; `show <sha>` kaydedilmemiş düşünceyi adlandırır, `readCommitThought`; `/health` sürümü, `/api/stop` (Origin'li POST reddi), `stopStaleServer` + `ensureServer` eski sürümü emekliye ayırır. Minimap gizleme CSS (tarayıcıda elle). | yazıldı |
