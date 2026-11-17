"""Keep the Gemini CLI extension in step with the skill. Python 3 stdlib only.

Gemini CLI loads an extension's skills from skills/<name>/SKILL.md next to a gemini-extension.json at the
repository root, but loupe's SKILL.md lives at the root. Symlinks do not work (Gemini rewrites them to absolute
paths into the temporary clone it installs from), so skills/loupe/ holds real copies of what the skill needs.

Usage:
  python3 -I tools/sync_extension.py           copy, and set the manifest version from package.json
  python3 -I tools/sync_extension.py --check   exit 1 if anything is out of step (CI runs this)
"""
import filecmp, json, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "skills", "loupe")
ITEMS = ["SKILL.md", "references", "scripts", "bin", "lib", "package.json"]
MANIFEST = os.path.join(ROOT, "gemini-extension.json")


def tree_diffs(src, dst, rel):
    """Paths under rel that differ between src and dst."""
    out = []
    if os.path.isdir(src):
        if not os.path.isdir(dst):
            return [rel + "/"]
        a, b = sorted(os.listdir(src)), sorted(os.listdir(dst))
        for name in sorted(set(a) | set(b)):
            if name == "__pycache__" or name == ".DS_Store":
                continue
            if name not in a or name not in b:
                out.append(f"{rel}/{name}")
            else:
                out += tree_diffs(os.path.join(src, name), os.path.join(dst, name), f"{rel}/{name}")
        return out
    if not os.path.isfile(dst) or not filecmp.cmp(src, dst, shallow=False):
        out.append(rel)
    return out


def manifest_problems():
    try:
        with open(MANIFEST, encoding="utf-8") as f:
            m = json.load(f)
        with open(os.path.join(ROOT, "package.json"), encoding="utf-8") as f:
            v = json.load(f)["version"]
    except (OSError, ValueError) as e:
        return [f"gemini-extension.json: {e}"]
    p = []
    if m.get("version") != v:
        p.append(f"gemini-extension.json version {m.get('version')} != package.json {v}")
    return p


def main(argv):
    check = "--check" in argv
    if any(a not in ("--check",) for a in argv):
        print(__doc__)
        return 2
    diffs = []
    for item in ITEMS:
        diffs += tree_diffs(os.path.join(ROOT, item), os.path.join(DEST, item), f"skills/loupe/{item}")
    problems = manifest_problems()
    if os.path.isdir(DEST):
        for name in os.listdir(DEST):
            if name not in ITEMS and name != ".DS_Store":
                diffs.append(f"skills/loupe/{name} (not a synced item)")
    if check:
        for d in diffs:
            print(f"out of step: {d}")
        for p in problems:
            print(f"out of step: {p}")
        if diffs or problems:
            print("run: python3 -I tools/sync_extension.py")
            return 1
        print("extension copy is current")
        return 0
    os.makedirs(DEST, exist_ok=True)
    for name in os.listdir(DEST):
        if name not in ITEMS:
            p = os.path.join(DEST, name)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    for item in ITEMS:
        src, dst = os.path.join(ROOT, item), os.path.join(DEST, item)
        if os.path.isdir(src):
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"))
        else:
            shutil.copy2(src, dst)
    with open(MANIFEST, encoding="utf-8") as f:
        m = json.load(f)
    with open(os.path.join(ROOT, "package.json"), encoding="utf-8") as f:
        m["version"] = json.load(f)["version"]
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2)
        f.write("\n")
    print(f"synced {len(ITEMS)} items to skills/loupe/, manifest version {m['version']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
