#!/usr/bin/env python3
"""Repair Tekstura photo thumbnails and missing PWA shell with targeted changes.

No homelab internet required. Uses the two bundles already copied to /tmp.
Default mode is READ ONLY. --apply requires all checks to pass and makes backup.
"""
import argparse
import base64
import datetime
import difflib
import os
from pathlib import Path
import re
import runpy
import shutil
import subprocess
import sys
import tempfile

ROOT = Path("/home/vladimir/zamery-production-20261007/frontend-public")
SNAPSHOT = Path("/tmp/photo-fix-offline-bundle.py")
ASSETS = Path("/tmp/repair-homelab-photo-and-pwa.py")
VERSION = "20261109-photo-homelab-v1"
CACHE_VERSION = "tekstura-offline-shell-v43"
FILES = ("app.js", "production.js", "index.html", "production.html", "service-worker.js")
REQUIRED_EXISTING = ("offline-db.js", "manifest.webmanifest", "vendor/supabase-js.js",
                     "styles.css", "photo-path.js", "sync-state.js",
                     "deletion-safety.js", "icon-192.png")

def only_once(text, old, new, where):
    if old not in text or text.count(old) != 1:
        raise RuntimeError(where + ": expected exactly one matching code fragment; no changes")
    return text.replace(old, new, 1)

def replace_const(src, key, value, where):
    pattern = r'(?m)^(const ' + re.escape(key) + r'\s*=\s*")[^"]*(";)'
    out, count = re.subn(pattern, lambda m: m.group(1) + value + m.group(2), src)
    if count != 1:
        raise RuntimeError(where + ": could not update constant " + key)
    return out

def const_value(src, key):
    m = re.search(r'(?m)^const ' + re.escape(key) + r'\s*=\s*[^;]+;', src)
    return m.group(0) if m else None

def get_function(source, name, where):
    pat = r'(?ms)^(?:async )?function ' + re.escape(name) + r'\([^\n]*\) \{.*?^\}\n'
    matches = list(re.finditer(pat, source))
    if len(matches) != 1:
        raise RuntimeError(where + ": could not isolate function " + name)
    return matches[0].group(0)

def splice_function(current, base, changed, name, where):
    """Apply only donor function's changed hunks; retain unrelated local edits."""
    local_fn = get_function(current, name, where)
    before_fn = get_function(base, name, "baseline")
    after_fn = get_function(changed, name, "photo fix")
    old_lines = before_fn.splitlines(keepends=True)
    new_lines = after_fn.splitlines(keepends=True)
    if before_fn == after_fn:
        return current
    matcher = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False)
    # Context anchors within the same function prevent accidental changes elsewhere.
    for group in matcher.get_grouped_opcodes(3):
        i1, i2 = group[0][1], group[-1][2]
        j1, j2 = group[0][3], group[-1][4]
        old_fragment = "".join(old_lines[i1:i2])
        new_fragment = "".join(new_lines[j1:j2])
        if not old_fragment or local_fn.count(old_fragment) != 1:
            raise RuntimeError(
                where + "." + name +
                ": its server version changed near the photo fix; manual review required"
            )
        local_fn = local_fn.replace(old_fragment, new_fragment, 1)
    return only_once(current, get_function(current, name, where), local_fn, where + "." + name)

def add_helper(src, helper, before_func, where):
    if get_function(helper, before_func, "helper snapshot"):
        pass

def repair_app(local, base, fixed):
    out = local
    out = replace_const(out, "TEKSTURA_APP_JS_VERSION", VERSION, "app.js")
    out = replace_const(out, "OFFLINE_SHELL_CACHE_NAME", CACHE_VERSION + "-app-shell", "app.js")

    for name in ("signedPhotoUrl", "renderPhotoImage", "logout",
                 "selectMeasurement", "loadPhotos"):
        out = splice_function(out, base, fixed, name, "app.js")
    head = re.search(
        r'(?ms)^const PHOTO_THUMBNAIL_TRANSFORM = .*?^const photoThumbnailCache = new Map\(\);\n',
        fixed,
    )
    if not head:
        raise RuntimeError("Photo transform constants absent from donor")
    out = only_once(out, "async function signedPhotoUrl(path) {",
                    head.group(0) + "\nasync function signedPhotoUrl(path) {",
                    "app.js photo config")
    helper = get_function(fixed, "handlePhotoImageError", "app donor")
    out = only_once(out, "function renderPhotoImage(",
                    helper + "\nfunction renderPhotoImage(",
                    "app.js error handler")
    out = only_once(out, "renderPhotoImage(previewUrl, type, filePath)",
                    'renderPhotoImage(previewUrl, type, filePath, photo.originalUrl || "")',
                    "app.js preview")
    out = only_once(out, "renderPhotoImage(p.url, titleText, filePath)",
                    'renderPhotoImage(p.url, titleText, filePath, p.originalUrl || "")',
                    "app.js photo gallery")
    return out

def repair_production(local, base, fixed):
    out = local
    old_state = re.search(r'(?m)^const state = \{[^\n]+\};', out)
    if not old_state or old_state.group(0).count("photos: []") != 1:
        raise RuntimeError("production.js: state declaration differs")
    state = old_state.group(0)
    if "photosLoading" not in state:
        revised = state.replace("photos: [],", "photos: [], photosLoading: false,", 1)
        out = only_once(out, state, revised, "production.js state")
    # The already-copied bundle predates a corrected loop in this function.
    corrected = fixed.replace(
        '  $(".production-photo img").forEach((img) => {',
        '  $$(".production-photo img").forEach((img) => {'
    )
    for name in ("logout", "selectMeasurement", "loadPhotos",
                 "signedPhotoUrl", "renderPhotos", "bindProductionPhotoFallbacks"):
        out = splice_function(out, base, corrected, name, "production.js")
    head = re.search(
        r'(?ms)^const PHOTO_THUMBNAIL_TRANSFORM = .*?^const productionThumbnailCache = new Map\(\);\n',
        corrected,
    )
    if not head:
        raise RuntimeError("Production image config absent from donor")
    out = only_once(out, "async function signedPhotoUrl(path) {",
                    head.group(0) + "\nasync function signedPhotoUrl(path) {",
                    "production.js photo config")
    helper = get_function(corrected, "handleProductionPhotoImageError", "production donor")
    out = only_once(out, "function bindProductionPhotoFallbacks() {",
                    helper + "\nfunction bindProductionPhotoFallbacks() {",
                    "production.js error handler")
    if '$$(".production-photo img").forEach' not in out:
        raise RuntimeError("production image retry handlers not attached")
    return out

def update_html(src, filename):
    name = "app.js" if filename == "index.html" else "production.js"
    pat = r'(\./' + re.escape(name) + r'\?v=)[^"]+'
    out, n = re.subn(pat, lambda m: m.group(1) + VERSION, src)
    if n != 1: raise RuntimeError(filename + ": script ref changed; check manually")
    return out

def prepare(root, snapshot, assets, tmp):
    for name in REQUIRED_EXISTING:
        if not (root / name).is_file():
            raise RuntimeError("Required shell asset missing: " + name)
    b = runpy.run_path(str(snapshot), run_name="_photo_snapshot_")
    a = runpy.run_path(str(assets), run_name="_offline_assets_")
    originals = {}
    for name in FILES:
        p = root / name
        if p.is_symlink(): raise RuntimeError("Refusing symlink: " + name)
        originals[name] = p.read_bytes() if p.is_file() else None
        if originals[name] is None and name != "service-worker.js":
            raise RuntimeError("Working file missing: " + name)

    fix = b["FIX_FILES"]
    base = b["BASE_FILES"]
    staged = {
        "app.js": repair_app(originals["app.js"].decode("utf-8"),
                             base["app.js"], fix["app.js"]),
        "production.js": repair_production(originals["production.js"].decode("utf-8"),
                                           base["production.js"], fix["production.js"]),
        "index.html": update_html(originals["index.html"].decode("utf-8"), "index.html"),
        "production.html": update_html(originals["production.html"].decode("utf-8"),
                                        "production.html"),
    }
    # A missing service worker is reconstructed, never taken from the current server.
    if originals["service-worker.js"] is None:
        staged["service-worker.js"] = fix["service-worker.js"]
    else:
        staged["service-worker.js"] = originals["service-worker.js"].decode("utf-8")
    staged["service-worker.js"] = replace_const(
        staged["service-worker.js"], "CACHE_VERSION", CACHE_VERSION, "service-worker.js"
    )
    old_ver = re.compile(r'(?m)("/?\.?/app\.js\?v=)[^"]+(")')
    # All worker precache entries must use the same URL as the updated HTML.
    staged["service-worker.js"], n = re.subn(
        r'((?:\.?/)?app\.js\?v=)[^"]+',
        lambda m: m.group(1) + VERSION,
        staged["service-worker.js"],
    )
    if n < 2: raise RuntimeError("Service worker script URL precache entries missing")

    original_app = originals["app.js"].decode("utf-8")
    original_production = originals["production.js"].decode("utf-8")
    for name, src in (("app.js", original_app), ("production.js", original_production)):
        for key in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_KEY"):
            if const_value(src, key) != const_value(staged[name], key):
                raise RuntimeError(name + ": Supabase config changed; refusing")
        if "createSignedUrls(paths, PHOTO_SIGNED_URL_SECONDS)" not in staged[name]:
            raise RuntimeError(name + ": original links signing missing")
        if "width: 480, quality: 70" not in staged[name]:
            raise RuntimeError(name + ": resized image config missing")
    if "async function compressPhotoForOffline(file)" not in staged["app.js"]:
        raise RuntimeError("Offline-photo code changed unexpectedly")
    if ".upload(path, file, { upsert: false })" not in staged["app.js"]:
        raise RuntimeError("Online-photo upload code changed unexpectedly")
    if CACHE_VERSION + "-app-shell" not in staged["app.js"]:
        raise RuntimeError("PWA version mismatch")
    if '$$(".production-photo img").forEach' not in staged["production.js"]:
        raise RuntimeError("Production image handler loop has unexpected shape")

    # Extra PWA pages and icon are created only if missing; never overwrite.
    updates = {name: data.encode("utf-8") for name, data in staged.items()}
    for name, content in a["EXTRA_TEXT"].items():
        p = root / name
        if p.is_symlink(): raise RuntimeError("Refusing symlink: " + name)
        originals[name] = p.read_bytes() if p.exists() else None
        if originals[name] is None:
            updates[name] = content.encode("utf-8")
    name = "icon-512.png"
    p = root / name
    if p.is_symlink(): raise RuntimeError("Refusing icon symlink")
    originals[name] = p.read_bytes() if p.exists() else None
    if originals[name] is None:
        icon = base64.b64decode(a["EXTRA_ICON_BASE64"])
        if not icon.startswith(bytes.fromhex("89504e470d0a1a0a")):
            raise RuntimeError("Embedded icon failed PNG header check")
        updates[name] = icon

    node = shutil.which("node")
    if node:
        for name in ("app.js", "production.js", "service-worker.js"):
            js = tmp / name
            js.write_bytes(updates[name])
            r = subprocess.run([node, "--check", str(js)], capture_output=True, text=True)
            if r.returncode:
                raise RuntimeError("JavaScript parse failed in " + name + ": " + r.stderr[-500:])
        print("JavaScript syntax: PASS")
    else:
        print("WARNING: Node.js is not installed; syntax check cannot run on homelab")
    return originals, updates, bool(node)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dir", type=Path, default=ROOT)
    p.add_argument("--apply", action="store_true")
    p.add_argument("--snapshot", type=Path, default=SNAPSHOT)
    p.add_argument("--assets", type=Path, default=ASSETS)
    args = p.parse_args()
    root = args.dir.resolve()
    if not root.is_dir(): raise RuntimeError("Working web root missing: " + str(root))
    if not args.snapshot.is_file() or not args.assets.is_file():
        raise RuntimeError("The two previously transferred bundles must exist in /tmp")
    print("MODE:", "APPLY + BACKUP" if args.apply else "CHECK ONLY; NO CHANGES")
    print("WEB ROOT:", root)
    with tempfile.TemporaryDirectory(prefix="tekstura-photo-safe-") as td:
        original, updates, syntax_checked = prepare(root, args.snapshot, args.assets, Path(td))
        if args.apply and not syntax_checked:
            raise RuntimeError("No node executable for mandatory JavaScript check before APPLY")
        changed = [n for n, data in updates.items() if original.get(n) != data]
        for name in changed:
            print("NEW" if original.get(name) is None else "UPDATE", name)
        print("Files to update/create:", len(changed))
        if not args.apply:
            print("CHECK PASSED; NO WORKING FILES MODIFIED")
            return
        when = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = root.parent / "photo-fix-backups" / when
        backup.mkdir(parents=True, exist_ok=False)
        for name in changed:
            if original.get(name) is not None:
                dest = backup / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(root / name, dest)
        (backup / "added-files.txt").write_text(
            "\n".join(n for n in changed if original.get(n) is None) + "\n",
            encoding="utf-8",
        )
        print("BACKUP CREATED:", backup)
        applied = []
        try:
            for name in changed:
                dst = root / name
                fd, stage = tempfile.mkstemp(prefix=".photo-v43-", dir=dst.parent)
                try:
                    with os.fdopen(fd, "wb") as fh: fh.write(updates[name])
                    if original.get(name) is None: os.chmod(stage, 0o644)
                    else: shutil.copymode(dst, stage)
                    os.replace(stage, dst)
                finally:
                    if os.path.exists(stage): os.unlink(stage)
                applied.append(name)
        except BaseException:
            for name in reversed(applied):
                if original[name] is None: (root / name).unlink(missing_ok=True)
                else: shutil.copy2(backup / name, root / name)
            raise
        print("APPLIED. Backups:", backup)
        print("No Docker restart, DB change, or Storage writes were performed.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("SAFE STOP:", exc, file=sys.stderr)
        sys.exit(1)
