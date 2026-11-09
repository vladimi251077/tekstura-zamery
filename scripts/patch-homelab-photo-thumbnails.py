#!/usr/bin/env python3
"""Safely merge PR #104 photo improvements into the homelab Zamery web directory.

Read-only by default. --apply creates a dated backup before replacing any web files.
Only five front-end files are touched; no DB, Storage, or Docker changes.
"""
import argparse
import datetime
import difflib
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

DEFAULT_DIR = Path("/home/vladimir/zamery-production-20261007/frontend-public")
REPO = "vladimi251077/tekstura-zamery"
BASE = "39f2cee5cb979d175c05a8188407a0f3f5b01838"
FIX = "d3a5311fb7eb0283c00f40a3c16a1e93c8131799"
FILES = ("app.js", "production.js", "index.html", "production.html", "service-worker.js")
NEW_CACHE = "tekstura-offline-shell-v42"
SCRIPT_VERSION = "20261109-photo-thumbnails"


def fetch(path, ref):
    url = "https://raw.githubusercontent.com/{}/{}/{}".format(REPO, ref, path)
    request = urllib.request.Request(url, headers={"User-Agent": "tekstura-homelab-photo-fix/1.0"})
    with urllib.request.urlopen(request, timeout=35) as response:
        return response.read().decode("utf-8")


def merge_file(current, base, fixed, tmp, name):
    a, b, c = (tmp / (suffix + "-" + name) for suffix in ("current", "base", "fixed"))
    a.write_text(current, encoding="utf-8")
    b.write_text(base, encoding="utf-8")
    c.write_text(fixed, encoding="utf-8")
    result = subprocess.run(
        ["git", "merge-file", "--stdout", "-L", "homelab", "-L", "github-base",
         "-L", "PR-104", str(a), str(b), str(c)],
        capture_output=True, text=True, encoding="utf-8"
    )
    if result.returncode != 0:
        raise RuntimeError(
            "{}: merge conflict or git error (exit {}). "
            "Nothing was changed. Local context needs manual reconciliation.".format(name, result.returncode)
        )
    return result.stdout


def replace_cache_once(text, name):
    if name == "service-worker.js":
        pattern = r'(const CACHE_VERSION = ")[^"]+(";)' 
        result, n = re.subn(pattern, lambda m: m.group(1) + NEW_CACHE + m.group(2), text)
    elif name == "app.js":
        pattern = r'(const OFFLINE_SHELL_CACHE_NAME = ")[^"]+(";)' 
        result, n = re.subn(
            pattern,
            lambda m: m.group(1) + NEW_CACHE + "-app-shell" + m.group(2),
            text
        )
    else:
        return text
    if n != 1:
        raise RuntimeError("{}: could not identify exactly one PWA cache version".format(name))
    return result


def const_value(content, name):
    match = re.search(r'^const ' + re.escape(name) + r'\s*=\s*[^;]+;', content, re.M)
    return match.group(0) if match else None


def validate(merged, originals):
    for name in ("app.js", "production.js"):
        if const_value(merged[name], "SUPABASE_URL") != const_value(originals[name], "SUPABASE_URL"):
            raise RuntimeError("{}: Supabase API endpoint would change; refusing".format(name))
        for key in ("SUPABASE_ANON_KEY", "SUPABASE_KEY"):
            if const_value(merged[name], key) != const_value(originals[name], key):
                raise RuntimeError("{}: {} would change; refusing".format(name, key))
        if ".createSignedUrls(paths, PHOTO_SIGNED_URL_SECONDS)" not in merged[name]:
            raise RuntimeError("{}: missing signed-original URLs".format(name))
        if "width: 480, quality: 70" not in merged[name]:
            raise RuntimeError("{}: missing image transforms".format(name))
    if ("app.js?v=" + SCRIPT_VERSION) not in merged["index.html"]:
        raise RuntimeError("index.html: app JS cache-busting reference is not updated")
    if ("production.js?v=" + SCRIPT_VERSION) not in merged["production.html"]:
        raise RuntimeError("production.html: production JS cache-busting reference is not updated")
    if NEW_CACHE not in merged["service-worker.js"]:
        raise RuntimeError("service worker cache not bumped")
    if NEW_CACHE + "-app-shell" not in merged["app.js"]:
        raise RuntimeError("main app expects a different service worker cache")
    if "/app.js?v=" + SCRIPT_VERSION not in merged["service-worker.js"]:
        raise RuntimeError("service worker is not precaching the new main app")
    if "async function compressPhotoForOffline(file)" not in merged["app.js"]:
        raise RuntimeError("offline photo workflow missing")
    if '.upload(path, file, { upsert: false })' not in merged["app.js"]:
        raise RuntimeError("online upload code differs from expected; review manually")


def check_syntax(merged, tmp):
    node = shutil.which("node")
    if not node:
        print("WARNING: node not found; runtime syntax checks skipped")
        return
    for name in ("app.js", "production.js", "service-worker.js"):
        path = tmp / ("js-check-" + name)
        path.write_text(merged[name], encoding="utf-8")
        result = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError("JavaScript parse failed in {}: {}".format(name, result.stderr[-500:]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    parser.add_argument("--apply", action="store_true", help="write only after all checks and backup")
    args = parser.parse_args()
    root = args.dir.resolve()
    if not root.is_dir():
        raise RuntimeError("Missing web root: {}".format(root))
    if not shutil.which("git"):
        raise RuntimeError("git binary is required for a safe three-way merge")
    originals = {name: (root / name).read_text(encoding="utf-8") for name in FILES}
    print("Mode:", "APPLY" if args.apply else "CHECK ONLY (NO CHANGES)")
    print("Web root:", root)
    print("Repo baseline:", BASE[:12], "fix:", FIX[:12])
    print("Working Supabase URL:", const_value(originals["app.js"], "SUPABASE_URL"))
    merged = {}
    with tempfile.TemporaryDirectory(prefix="tekstura-photo-patch-") as td:
        tmp = Path(td)
        for name in FILES:
            print("Merging:", name)
            merged[name] = merge_file(
                originals[name], fetch(name, BASE), fetch(name, FIX), tmp, name
            )
            merged[name] = replace_cache_once(merged[name], name)
        validate(merged, originals)
        check_syntax(merged, tmp)
        for name in FILES:
            before = originals[name].splitlines()
            after = merged[name].splitlines()
            added = sum(1 for line in difflib.ndiff(before, after) if line.startswith("+ "))
            removed = sum(1 for line in difflib.ndiff(before, after) if line.startswith("- "))
            print("OK {}: +{} / -{} lines".format(name, added, removed))
        if not args.apply:
            print("CHECK PASSED. NO FILES WERE CHANGED. Next: rerun with --apply if approved.")
            return
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = root.parent / "photo-fix-backups" / stamp
        backup.mkdir(parents=True, exist_ok=False)
        for name in FILES:
            shutil.copy2(root / name, backup / name)
        digest = hashlib.sha256(originals["app.js"].encode("utf-8")).hexdigest()
        (backup / "original-app-sha256.txt").write_text(digest + "\n", encoding="ascii")
        print("BACKUP CREATED:", backup)
        changed = []
        try:
            for name in FILES:
                dst = root / name
                fd, stage = tempfile.mkstemp(prefix=".photo-fix-", dir=root)
                try:
                    with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
                        stream.write(merged[name])
                    shutil.copymode(dst, stage)
                    os.replace(stage, dst)
                finally:
                    if os.path.exists(stage):
                        os.unlink(stage)
                changed.append(name)
        except Exception:
            for name in reversed(changed):
                shutil.copy2(backup / name, root / name)
            raise
        print("APPLY COMPLETE:", ", ".join(changed))
        print("ROLLBACK COPY:", backup)
        print("Check browser/PWA and the original full-resolution photo. Do not clear IndexedDB.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, urllib.error.URLError) as exc:
        print("FAILED SAFE:", exc, file=sys.stderr)
        sys.exit(1)
