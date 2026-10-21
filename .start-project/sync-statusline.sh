#!/usr/bin/env python3
# statusLine command — bkz. make_sync_statusline_script/install_sync_statusline.
import json, os, subprocess, sys

raw = sys.stdin.buffer.read()
try:
    data = json.loads(raw or b"{}")
    parsed_ok = isinstance(data, dict)
except Exception:
    data, parsed_ok = {}, False
if not isinstance(data, dict):
    data, parsed_ok = {}, False

ws = data.get("workspace") or {}
proj_dir = ws.get("project_dir") or data.get("cwd") or ""

gitdir = None
if proj_dir:
    try:
        g = subprocess.check_output(
            ["git", "-C", proj_dir, "rev-parse", "--git-dir"],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
        gitdir = g if os.path.isabs(g) else os.path.join(proj_dir, g)
    except Exception:
        gitdir = None

# Son BASARILI delege ciktisi burada onbelleklenir; delege basarisiz olursa
# panel BASKA bir panele donusmesin diye bu kullanilir (fallback en son care).
cache_path = os.path.join(gitdir, "sync-statusline.cache") if gitdir else None


def run_global_statusline():
    """Kullanicinin ~/.claude/settings.json'undaki statusLine'i (varsa,
    BIZE ait degilse) AYNI stdin ile calistirir, ciktisini dondurur. Boylece
    OV plugin'inin saglik gostergesi (veya kullanicinin baska bir global
    statusline'i) SESSIZCE gizlenmez — proje-ozel statusLine'imiz onun
    yerini almak yerine ustune biner."""
    settings_path = os.path.join(os.path.expanduser("~"), ".claude", "settings.json")
    try:
        with open(settings_path, encoding="utf-8") as fh:
            g = json.load(fh)
    except Exception:
        return None
    cmd = (g.get("statusLine") or {}).get("command")
    if not cmd or "sync-statusline.sh" in cmd:
        return None  # yok, ya da kendimize referans (sonsuz dongu onlemi)
    try:
        r = subprocess.run(cmd, shell=True, input=raw, capture_output=True, timeout=5)
        out = r.stdout.decode("utf-8", errors="replace")
        return out if out.strip() else None
    except Exception:
        return None


def fallback_summary():
    """Global statusLine YOK ve onbellek de yoksa (ilk calisma): resmi Claude
    Code dokumanindaki cok satirli ornek desen (model + dizin + git branch |
    context% + maliyet + sure) — bkz. https://code.claude.com/docs/en/statusline.md"""
    model = (data.get("model") or {}).get("display_name", "?")
    directory = os.path.basename(ws.get("current_dir") or data.get("cwd") or "")
    cost = (data.get("cost") or {}).get("total_cost_usd") or 0
    duration_ms = (data.get("cost") or {}).get("total_duration_ms") or 0
    pct = int((data.get("context_window") or {}).get("used_percentage") or 0)

    CYAN, GREEN, YELLOW, RED, RESET = "\033[36m", "\033[32m", "\033[33m", "\033[31m", "\033[0m"
    bar_color = RED if pct >= 90 else YELLOW if pct >= 70 else GREEN
    filled = pct // 10
    bar = "█" * filled + "░" * (10 - filled)
    mins, secs = divmod(int(duration_ms) // 1000, 60)

    branch = ""
    try:
        b = subprocess.check_output(
            ["git", "branch", "--show-current"], text=True, stderr=subprocess.DEVNULL
        ).strip()
        branch = f" | 🌿 {b}" if b else ""
    except Exception:
        pass

    return (
        f"{CYAN}[{model}]{RESET} 📁 {directory}{branch}\n"
        f"{bar_color}{bar}{RESET} {pct}% | {YELLOW}${cost:.2f}{RESET} | ⏱️ {mins}m {secs}s"
    )


# ── 1) taban satir ──────────────────────────────────────────────────────
base = run_global_statusline()
if base is not None:
    if cache_path:
        try:
            with open(cache_path, "w", encoding="utf-8") as fh:
                fh.write(base)
        except Exception:
            pass
else:
    base = None
    if cache_path and os.path.isfile(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as fh:
                base = fh.read()
        except Exception:
            base = None
    if not base:
        # onbellek de yok — girdi anlamliysa doc fallback'i, degilse HICBIR SEY
        base = fallback_summary() if (parsed_ok and data.get("model")) else ""

base = (base or "").rstrip("\n")

# ── 2) OV/graphify post-commit sync gostergesi — AYNI SATIRA eklenir ────
# (kullanici "+7 today'in yaninda gozuksun" dedi; ayri satir/panel DEGIL)
seg = ""
if gitdir:
    try:
        import time

        def locked_since(name):
            """Kilit TUTULUYORSA .git/<name>'in mtime'ini (hook `9>dosya` ile
            ACARKEN guncellenir → sync ne zaman basladi) dondurur; bosta/yoksa None."""
            p = os.path.join(gitdir, name)
            if not os.path.isfile(p):
                return None
            r = subprocess.run(["flock", "-n", p, "true"], stderr=subprocess.DEVNULL)
            if r.returncode == 0:
                return None  # kilit BOSTA
            try:
                return os.path.getmtime(p)
            except OSError:
                return time.time()

        def fmt_elapsed(started):
            s = max(0, int(time.time() - started))
            return f"{s}s" if s < 60 else f"{s // 60}m {s % 60}s"

        names, oldest = [], None
        for label, fname in (("OV", "ov-sync.lock"), ("graphify", "graphify-sync.lock")):
            since = locked_since(fname)
            if since is not None:
                names.append(label)
                oldest = since if oldest is None else min(oldest, since)

        if names:
            DIM, YELLOW, RED, RESET = "\033[2m", "\033[33m", "\033[31m", "\033[0m"
            age = time.time() - oldest
            # ov add-resource (klasor tarama) timeout'u 1800s — 10dk/20dk esik
            # "muhtemelen uzun surecek/takili" icin kaba ama makul bir sinyal.
            color = RED if age > 1200 else (YELLOW if age > 600 else "")
            msg = f"⏳ {' + '.join(names)} sync çalışıyor… ({fmt_elapsed(oldest)})"
            body = f"{color}{msg}{RESET}" if color else msg
            seg = (f" {DIM}│{RESET} " if base else "") + body
    except Exception:
        seg = ""

out = base + seg
if out:
    sys.stdout.write(out + "\n")
