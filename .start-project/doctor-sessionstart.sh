#!/usr/bin/env bash
# SessionStart hook — start-project doctor (--quiet). Proje saglik kontrolu:
# hicbir sey degistirmez, sadece bakar. Cikti JSON (systemMessage +
# additionalContext) olarak Claude Code'a dondurulur.
cd "/home/master/Desktop/www/codelineage" 2>/dev/null || exit 0
[ -x "/home/master/Desktop/www/start-project/start-project" ] || exit 0
raw="$(timeout 15 "/home/master/Desktop/www/start-project/start-project" doctor . --quiet 2>&1)"
code=$?
# ANSI renk kodlarini temizle — systemMessage/additionalContext duz metin bekler
# (ov-memory-healthcheck.sh de bu yuzden emoji kullanip renk kodundan kacinir).
out="$(printf '%s\n' "$raw" | command sed -E 's/\x1b\[[0-9;]*m//g' | command sed '/^[[:space:]]*$/d')"
if [ "$code" -eq 0 ] && ! printf '%s\n' "$out" | command grep -qE '^[[:space:]]*!'; then
    # tamamen temiz — tek satir yeter (ov-memory-healthcheck.sh ile ayni desen)
    msg="✅ start-project doctor: 0 sorun"
else
    # uyari ve/veya sorun var — hepsini goster, ozeti gecistirme
    _prefix="⚠️"; [ "$code" -ne 0 ] && _prefix="🔴"
    msg="$_prefix start-project doctor (/home/master/Desktop/www/codelineage):
$out"
fi
python3 - "$msg" "$out" <<'PY'
import json, sys
msg, out = sys.argv[1], sys.argv[2]
print(json.dumps({
    "systemMessage": msg,
    "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": out},
}))
PY
