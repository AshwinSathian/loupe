"""Build the Gemini CLI extension archive. Python 3 stdlib only.

Gemini CLI loads an extension's skills from skills/<name>/SKILL.md inside the extension, with a
gemini-extension.json at its root, but loupe's SKILL.md lives at the repository root. Committing a copy under
skills/ would be installed inside the skill by `npx skills add` (which copies the whole directory), so Codex
and Cursor would see loupe twice. Symlinks do not work either: Gemini rewrites them to absolute paths into the
temporary clone it installs from. So the extension ships as a release asset: this script builds loupe.tar.gz,
and .github/workflows/release-assets.yml attaches it to each GitHub release, which `gemini extensions install
https://github.com/AshwinSathian/loupe` installs from.

Usage:
  python3 -I tools/build_extension.py [--out DIR]   write DIR/loupe.tar.gz (default: dist-extension/)
  python3 -I tools/build_extension.py --check       build in a temporary directory and validate the archive
Exit 1 if the manifest version differs from package.json, or the archive is malformed.
"""
import json, os, sys, tarfile, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITEMS = ["SKILL.md", "references", "scripts", "bin", "lib", "package.json"]
NAME = "loupe"


def files_under(path):
    if os.path.isdir(path):
        for d, dirs, files in os.walk(path):
            dirs[:] = sorted(x for x in dirs if x not in ("__pycache__", "node_modules"))
            for f in sorted(files):
                if f != ".DS_Store":
                    yield os.path.join(d, f)
    else:
        yield path


def build(out_dir):
    with open(os.path.join(ROOT, "package.json"), encoding="utf-8") as f:
        version = json.load(f)["version"]
    with open(os.path.join(ROOT, "gemini-extension.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    if manifest.get("name") != NAME:
        raise SystemExit(f"gemini-extension.json name is {manifest.get('name')!r}, expected {NAME!r}")
    if manifest.get("version") != version:
        raise SystemExit(f"gemini-extension.json version {manifest.get('version')} != package.json {version}")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{NAME}.tar.gz")

    def clean(ti):
        ti.uid = ti.gid = 0
        ti.uname = ti.gname = ""
        ti.mtime = 0
        return ti

    with tarfile.open(dest, "w:gz") as tar:
        tar.add(os.path.join(ROOT, "gemini-extension.json"), arcname="gemini-extension.json", filter=clean)
        for item in ITEMS:
            for p in files_under(os.path.join(ROOT, item)):
                rel = os.path.relpath(p, ROOT)
                tar.add(p, arcname=f"skills/{NAME}/{rel}", filter=clean)
    return dest, version


def validate(dest, version):
    with tarfile.open(dest) as tar:
        names = tar.getnames()
        if "gemini-extension.json" not in names:
            raise SystemExit("archive has no gemini-extension.json at its root")
        for need in (f"skills/{NAME}/SKILL.md", f"skills/{NAME}/references/workflow-intake.md", f"skills/{NAME}/scripts/measure.js"):
            if need not in names:
                raise SystemExit(f"archive is missing {need}")
        bad = [n for n in names if n.startswith("/") or ".." in n.split("/")]
        if bad or any(m.issym() or m.islnk() for m in tar.getmembers()):
            raise SystemExit("archive has absolute paths, parent paths or links")
        manifest = json.load(tar.extractfile("gemini-extension.json"))
        skill = tar.extractfile(f"skills/{NAME}/SKILL.md").read()
    with open(os.path.join(ROOT, "SKILL.md"), "rb") as f:
        if f.read() != skill:
            raise SystemExit("archived SKILL.md differs from the repository's")
    if manifest["version"] != version:
        raise SystemExit("archived manifest version differs")


def main(argv):
    args = list(argv)
    check = "--check" in args
    if check:
        args.remove("--check")
    out = "dist-extension"
    if "--out" in args:
        i = args.index("--out")
        out = args[i + 1] if i + 1 < len(args) else None
        del args[i:i + 2]
    if args or out is None:
        print(__doc__)
        return 2
    if check:
        with tempfile.TemporaryDirectory() as tmp:
            dest, version = build(tmp)
            validate(dest, version)
            print(f"extension archive builds and validates ({os.path.getsize(dest) // 1024} KB, version {version})")
        return 0
    dest, version = build(os.path.join(ROOT, out) if not os.path.isabs(out) else out)
    validate(dest, version)
    print(f"wrote {os.path.relpath(dest, ROOT) if dest.startswith(ROOT) else dest} (version {version})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
