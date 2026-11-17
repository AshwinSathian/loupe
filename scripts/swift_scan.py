"""Deterministic source scan for SwiftUI, UIKit and React Native apps, plus the (26+) gate. Python 3 stdlib only.

Usage: python3 -I scripts/swift_scan.py <project dir> [--app <built .app>]

Reads *.swift, *.tsx, *.jsx, *.ts, *.js (not node_modules, Pods, build or DerivedData), project.pbxproj files
and Info.plist files. It never builds, runs or edits anything. Prints one JSON object:
  project: deployment targets, LastUpgradeCheck, XCODE_VERSION_ACTUAL, an SDK named in a pbxproj comment, the UIDesignRequiresCompatibility opt-out, and the SDK and
           Xcode a built app records (DTSDKName, DTXcode) when --app is given. `xcrun simctl get_app_container
           booted <bundle id>` prints a simulator app's path.
  gate:    whether the (26+) checks run, and on what basis (SKILL.md, "26 gate"): SDK 27 or later runs them
           whatever the opt-out says; SDK 26 runs them unless the opt-out is set; an unknown SDK falls back to
           the deployment target and says so.
  findings: [{rule, file, line, hint, detail}]. Each is evidence from source, read with SKILL.md's Impact
           rules; `hint` is the usual Impact, not a verdict. Rules:
    fixed-font          .system(size:), .custom(_, fixedSize:), UIFont.systemFont(ofSize:) or UIFont(name:size:)
                        in a file with no UIFontMetrics: text that ignores Dynamic Type.
    dynamic-type-cap    .dynamicTypeSize(...) whose upper bound is below .accessibility1.
    asset-image-button  Image("name") within 3 lines after a Button, with no accessibilityLabel in its modifier
                        chain: VoiceOver reads the asset name (a poor name, Major; not a missing one).
    tap-gesture         .onTapGesture with no .accessibilityAddTraits(.isButton) in its modifier chain: not
                        exposed as a button.
    rn-font-scaling     allowFontScaling false, or maxFontSizeMultiplier at 1: React Native text that ignores
                        the system text size.
The modifier chain is the lines after that start with '.', '}' or ')': a heuristic, so confirm in the file.
"""
import json, os, plistlib, re, sys

SKIP_DIRS = {"node_modules", "Pods", "build", "DerivedData", ".git", ".build", "Carthage", "vendor"}
SRC_EXT = (".swift", ".tsx", ".jsx", ".ts", ".js")


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)


def walk(root):
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.endswith(".xcassets")]
        for f in files:
            yield os.path.join(d, f)


def chain(lines, i, pattern):
    """True when pattern is on line i or in the modifier chain after it: following lines that start with
    '.', '}' or ')', up to 8 lines. A line starting a new view ends the chain."""
    if re.search(pattern, lines[i]):
        return True
    for l in lines[i + 1:i + 9]:
        s = l.strip()
        if not s.startswith((".", "}", ")")):
            return False
        if re.search(pattern, s):
            return True
    return False


def before(lines, i, pattern, n=3):
    return any(re.search(pattern, l) for l in lines[max(0, i - n):i + 1])


DT_ORDER = ["xSmall", "small", "medium", "large", "xLarge", "xxLarge", "xxxLarge",
            "accessibility1", "accessibility2", "accessibility3", "accessibility4", "accessibility5"]


def scan_swift(path, rel, text, out):
    lines = text.splitlines()
    has_metrics = "UIFontMetrics" in text or "adjustsFontForContentSizeCategory" in text
    for i, l in enumerate(lines):
        code = l.split("//", 1)[0]
        n = i + 1
        if re.search(r"\.system\(\s*size\s*:", code) or re.search(r"\.custom\([^)]*fixedSize\s*:", code):
            out.append({"rule": "fixed-font", "file": rel, "line": n, "hint": "Major",
                        "detail": "SwiftUI font with a fixed size: does not scale with Dynamic Type (use a text style, or .custom(_:size:relativeTo:))"})
        if not has_metrics and re.search(r"UIFont\.systemFont\(\s*ofSize\s*:|UIFont\(\s*name\s*:[^)]*size\s*:", code):
            out.append({"rule": "fixed-font", "file": rel, "line": n, "hint": "Major",
                        "detail": "UIKit font with a fixed size and no UIFontMetrics in the file: does not scale with Dynamic Type"})
        m = re.search(r"\.dynamicTypeSize\(([^)]*)\)", code)
        if m:
            upper = re.findall(r"\.\.\.?\s*\.?(?:DynamicTypeSize\.)?(\w+)", m.group(1))
            if upper and upper[-1] in DT_ORDER and DT_ORDER.index(upper[-1]) < DT_ORDER.index("accessibility1"):
                out.append({"rule": "dynamic-type-cap", "file": rel, "line": n, "hint": "Major",
                            "detail": f"Dynamic Type capped at .{upper[-1]}, below the accessibility sizes"})
        if re.search(r'\bImage\(\s*"', code) and not re.search(r"decorative\s*:", code):
            if before(lines, i, r"\bButton\b") and not chain(lines, i, r"accessibilityLabel|accessibility\(label"):
                out.append({"rule": "asset-image-button", "file": rel, "line": n, "hint": "Major",
                            "detail": "Image(\"…\") as a button label with no accessibilityLabel: VoiceOver reads the asset name"})
        if ".onTapGesture" in code and not chain(lines, i, r"accessibilityAddTraits\(\s*\.isButton|accessibility\(addTraits"):
            out.append({"rule": "tap-gesture", "file": rel, "line": n, "hint": "Major",
                        "detail": ".onTapGesture with no .isButton trait nearby: VoiceOver does not announce it as a button (prefer Button)"})


def scan_js(rel, text, out):
    for i, l in enumerate(text.splitlines()):
        if re.search(r"allowFontScaling\s*[=:]\s*\{?\s*false", l) or re.search(r"maxFontSizeMultiplier\s*[=:]\s*\{?\s*1(\.0)?\b(?!\.\d)", l):
            out.append({"rule": "rn-font-scaling", "file": rel, "line": i + 1, "hint": "Major",
                        "detail": "React Native text that ignores the system text size"})


def project_info(root, app):
    info = {"deployment_targets": {}, "last_upgrade_check": None, "xcode_version_actual": None, "sdk_comment": None, "opt_out": None, "opt_out_source": None,
            "sdk": None, "xcode": None, "sdk_source": None}
    for p in walk(root):
        rel = os.path.relpath(p, root)
        if p.endswith("project.pbxproj"):
            t = open(p, encoding="utf-8", errors="replace").read()
            for key, plat in (("IPHONEOS_DEPLOYMENT_TARGET", "ios"), ("MACOSX_DEPLOYMENT_TARGET", "macos")):
                vals = sorted({float(v) for v in re.findall(key + r"\s*=\s*\"?([\d.]+)", t)})
                if vals:
                    info["deployment_targets"][plat] = vals[0]
            m = re.search(r"LastUpgradeCheck\s*=\s*(\d+)", t)
            if m:
                info["last_upgrade_check"] = int(m.group(1))
            m = re.search(r"XCODE_VERSION_ACTUAL\s*=\s*(\d+)", t)
            if m:
                info["xcode_version_actual"] = int(m.group(1))
            m = re.search(r"^\s*//(.*\b(?:iOS|macOS|iphoneos|macosx)\s*\d+(?:\.\d+)?\s*SDK.*)$", t, re.I | re.M)
            if m:
                info["sdk_comment"] = m.group(1).strip()[:120]
            if re.search(r"INFOPLIST_KEY_UIDesignRequiresCompatibility\s*=\s*YES", t):
                info["opt_out"], info["opt_out_source"] = True, rel
        elif os.path.basename(p) == "Info.plist":
            try:
                with open(p, "rb") as f:
                    pl = plistlib.load(f)
            except Exception:
                continue
            if pl.get("UIDesignRequiresCompatibility") is True:
                info["opt_out"], info["opt_out_source"] = True, rel
    if app:
        try:
            with open(os.path.join(app, "Info.plist"), "rb") as f:
                pl = plistlib.load(f)
        except Exception as e:
            fail(f"cannot read {app}/Info.plist: {e}")
        info["sdk"], info["xcode"], info["sdk_source"] = pl.get("DTSDKName"), pl.get("DTXcode"), os.path.join(app, "Info.plist")
    return info


def gate(info):
    sdk = re.search(r"(\d+)(?:\.\d+)?$", info["sdk"] or "")
    if sdk:
        major = int(sdk.group(1))
        if major >= 27:
            return {"run": True, "basis": f"built with the {info['sdk']} SDK; 27 and later ignore the opt-out"}
        if major == 26:
            return {"run": not info["opt_out"], "basis": f"built with the {info['sdk']} SDK" + ("; opt-out set" if info["opt_out"] else "")}
        return {"run": False, "basis": f"built with the {info['sdk']} SDK, before 26"}
    if info["sdk_comment"]:
        major = int(float(re.search(r"(\d+(?:\.\d+)?)\s*SDK", info["sdk_comment"], re.I).group(1)))
        basis = f'project.pbxproj comment "{info["sdk_comment"]}"; confirm with --app or the CI image'
        if major >= 27:
            return {"run": True, "basis": basis, "unverified": True}
        return {"run": major == 26 and not info["opt_out"], "basis": basis + ("; opt-out set" if info["opt_out"] else ""), "unverified": True}
    luc = info["xcode_version_actual"] or info["last_upgrade_check"]
    if luc and luc >= 2600:
        x = luc // 100
        src = "XCODE_VERSION_ACTUAL" if info["xcode_version_actual"] else "LastUpgradeCheck"
        note = f"{src} is the Xcode that last saved the project, not proof of the build SDK; confirm with --app or the CI image"
        if x >= 27:
            return {"run": True, "basis": f"{src} {luc} (Xcode {x}): {note}", "unverified": True}
        return {"run": not info["opt_out"], "basis": f"{src} {luc} (Xcode {x})" + ("; opt-out set" if info["opt_out"] else "") + f": {note}", "unverified": True}
    dt = info["deployment_targets"].get("ios") or info["deployment_targets"].get("macos")
    if dt:
        return {"run": dt >= 26 and not info["opt_out"], "basis": f"SDK unknown; fell back to deployment target {dt}", "unverified": True}
    return {"run": False, "basis": "SDK and deployment target unknown: skip the (26+) checks and list them as Unverified", "unverified": True}


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0 if argv else 2)
    root, app = argv[0], None
    if "--app" in argv:
        i = argv.index("--app")
        if i + 1 >= len(argv):
            fail("--app needs a path to a built .app")
        app = argv[i + 1]
    if not os.path.isdir(root):
        fail(f"not a directory: {root}")
    findings, scanned = [], 0
    for p in walk(root):
        if not p.endswith(SRC_EXT) or os.path.getsize(p) > 2_000_000:
            continue
        rel = os.path.relpath(p, root)
        text = open(p, encoding="utf-8", errors="replace").read()
        scanned += 1
        (scan_swift(p, rel, text, findings) if p.endswith(".swift") else scan_js(rel, text, findings))
    info = project_info(root, app)
    print(json.dumps({"files_scanned": scanned, "project": info, "gate": gate(info), "findings": findings}, indent=1))


if __name__ == "__main__":
    main(sys.argv[1:])
