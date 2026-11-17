"""WCAG 2 contrast for declared colour-token pairs in Design Tokens (DTCG 2025.10) files. Python 3 stdlib only.

Usage:
  python3 -I scripts/tokens.py <tokens.json>... --pair <fg>:<bg> [--pair ...]
  python3 -I scripts/tokens.py --mode light=<file>[,<file>] --mode dark=<file>[,<file>] --pair <fg>:<bg> ...
  python3 -I scripts/tokens.py ... --pairs <pairs.json>    (a JSON list of ["fg.token", "bg.token"] or
                                                            {"fg": ..., "bg": ..., "large": true})
Token paths are dot-separated (color.text.primary). Files in one mode merge in order, later files winning,
so a base file plus a per-mode file works. DTCG 2025.10 core has no modes; the Resolver module's modifiers
are not read: export one file set per mode, or pass each resolved output with --mode.

Values read: aliases ("{color.base.ink}", followed through chains, cycles rejected), DTCG Color module
objects ({"colorSpace", "components", "alpha", "hex"}) in srgb, srgb-linear, hsl, hwb, display-p3, oklab,
oklch, lab, lch, xyz-d65 and xyz-d50, and plain #hex strings. "hex" is used only as the fallback for a colour
space this script does not convert. Colours outside sRGB are clamped to sRGB (as scripts/measure.js does)
and the row says clamped: true. "none" components count as 0.

Only declared pairs are checked: an all-pairs matrix would flag combinations no screen uses.
Prints one JSON line per pair and mode: {mode, fg, bg, fg_hex, bg_hex, ratio, need, pass, clamped}, where
need is 4.5 (3 with large). The ratio math is scripts/contrast.py's. Exit 1 if any pair fails, 2 on error.
"""
import importlib.util, json, math, os, re, sys

_spec = importlib.util.spec_from_file_location("contrast", os.path.join(os.path.dirname(os.path.abspath(__file__)), "contrast.py"))
contrast = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(contrast)


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)


def mul(m, v):
    return [sum(m[i][j] * v[j] for j in range(3)) for i in range(3)]


XYZ65_TO_LSRGB = [[3.2409699419045226, -1.537383177570094, -0.4986107602930034],
                  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
                  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786]]
LP3_TO_XYZ65 = [[0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
                [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
                [0.0, 0.04511338185890264, 1.043944368900976]]
XYZ50_TO_XYZ65 = [[0.955473421488075, -0.02309845494876471, 0.06325924320057072],
                  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
                  [0.012314014864481998, -0.020507649298898964, 1.330365926242124]]
D50 = [0.3457 / 0.3585, 1.0, (1.0 - 0.3457 - 0.3585) / 0.3585]


def to_lin(v):
    s = -1 if v < 0 else 1
    v = abs(v)
    return s * (v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)


def from_lin(v):
    s = -1 if v < 0 else 1
    v = abs(v)
    return s * (12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055)


def hsl_to_srgb(h, s, l):
    s, l = s / 100, l / 100
    f = lambda n: l - s * min(l, 1 - l) * max(-1, min((n + h / 30) % 12 - 3, 9 - (n + h / 30) % 12, 1))
    return [f(0), f(8), f(4)]


def lab_to_xyz50(L, a, b):
    k, e = 24389 / 27, 216 / 24389
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    x = fx ** 3 if fx ** 3 > e else (116 * fx - 16) / k
    y = ((L + 16) / 116) ** 3 if L > k * e else L / k
    z = fz ** 3 if fz ** 3 > e else (116 * fz - 16) / k
    return [x * D50[0], y * D50[1], z * D50[2]]


def oklab_to_lsrgb(L, a, b):
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
            -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
            -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_]


def polar(c, h):
    return c * math.cos(math.radians(h)), c * math.sin(math.radians(h))


def to_srgb(space, c):
    """Gamma-encoded sRGB in 0..1, unclamped, or None for an unsupported space."""
    if space == "srgb":
        return list(c)
    if space == "srgb-linear":
        return [from_lin(v) for v in c]
    if space == "hsl":
        return hsl_to_srgb(*c)
    if space == "hwb":
        h, w, b = c[0], c[1] / 100, c[2] / 100
        if w + b >= 1:
            return [w / (w + b)] * 3
        return [v * (1 - w - b) + w for v in hsl_to_srgb(h, 100, 50)]
    lin = None
    if space == "display-p3":
        lin = mul(XYZ65_TO_LSRGB, mul(LP3_TO_XYZ65, [to_lin(v) for v in c]))
    elif space == "oklab":
        lin = oklab_to_lsrgb(*c)
    elif space == "oklch":
        lin = oklab_to_lsrgb(c[0], *polar(c[1], c[2]))
    elif space == "lab":
        lin = mul(XYZ65_TO_LSRGB, mul(XYZ50_TO_XYZ65, lab_to_xyz50(*c)))
    elif space == "lch":
        lin = mul(XYZ65_TO_LSRGB, mul(XYZ50_TO_XYZ65, lab_to_xyz50(c[0], *polar(c[1], c[2]))))
    elif space == "xyz-d65":
        lin = mul(XYZ65_TO_LSRGB, c)
    elif space == "xyz-d50":
        lin = mul(XYZ65_TO_LSRGB, mul(XYZ50_TO_XYZ65, c))
    return None if lin is None else [from_lin(v) for v in lin]


def color(value, path):
    """-> ([r, g, b, alpha] with channels 0..255, clamped flag)."""
    if isinstance(value, str):
        rgba = contrast.parse(value)
        return rgba, False
    if not isinstance(value, dict) or "colorSpace" not in value:
        fail(f"{path}: not a DTCG colour value: {json.dumps(value)[:80]}")
    comps = [0.0 if x == "none" else float(x) for x in value.get("components", [])]
    if len(comps) != 3 or not all(math.isfinite(x) for x in comps):
        fail(f"{path}: components must be three numbers")
    alpha = value.get("alpha", 1)
    alpha = 1.0 if alpha == "none" else min(max(float(alpha), 0.0), 1.0)
    rgb = to_srgb(value["colorSpace"], comps)
    if rgb is None:
        if "hex" in value:
            rgba = contrast.parse(value["hex"])
            return rgba[:3] + [alpha], False
        fail(f"{path}: colour space {value['colorSpace']} is not converted here and has no hex fallback")
    clamped = any(v < -1e-4 or v > 1 + 1e-4 for v in rgb)
    return [min(max(v, 0.0), 1.0) * 255 for v in rgb] + [alpha], clamped


def flatten(tree, prefix="", inherited=None, out=None):
    out = {} if out is None else out
    t = tree.get("$type", inherited) if isinstance(tree, dict) else inherited
    for k, v in tree.items():
        if k.startswith("$") or not isinstance(v, dict):
            continue
        path = f"{prefix}{k}"
        if "$value" in v:
            out[path] = {"value": v["$value"], "type": v.get("$type", t)}
        else:
            flatten(v, path + ".", t, out)
    return out


def resolve(tokens, path, seen=()):
    if path not in tokens:
        fail(f"unknown token {path}")
    if path in seen:
        fail(f"alias cycle: {' -> '.join(seen + (path,))}")
    v = tokens[path]["value"]
    m = re.fullmatch(r"\{([^{}]+)\}", v) if isinstance(v, str) else None
    return resolve(tokens, m.group(1), seen + (path,)) if m else v


def load(files):
    tokens = {}
    for f in files:
        try:
            with open(f, encoding="utf-8") as fh:
                tokens.update(flatten(json.load(fh)))
        except (OSError, ValueError) as e:
            fail(f"cannot read {f}: {e}")
    return tokens


def hexof(c):
    return "#" + "".join(f"{round(v):02x}" for v in c[:3])


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0 if argv else 2)
    modes, plain, pairs = {}, [], []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("--mode", "--pair", "--pairs"):
            if i + 1 >= len(argv):
                fail(f"{a} needs a value")
            v = argv[i + 1]
            if a == "--mode":
                name, _, files = v.partition("=")
                if not files:
                    fail("--mode needs name=file[,file]")
                modes[name] = files.split(",")
            elif a == "--pair":
                fg, _, bg = v.partition(":")
                if not bg:
                    fail("--pair needs fg.token:bg.token")
                pairs.append({"fg": fg, "bg": bg, "large": False})
            else:
                try:
                    with open(v, encoding="utf-8") as fh:
                        for p in json.load(fh):
                            pairs.append({"fg": p[0], "bg": p[1], "large": False} if isinstance(p, list) else {"large": False, **p})
                except (OSError, ValueError, KeyError, IndexError) as e:
                    fail(f"cannot read pairs from {v}: {e}")
            i += 2
        else:
            plain.append(a)
            i += 1
    if plain and modes:
        fail("give token files either as arguments or with --mode, not both")
    if not pairs:
        fail("no pairs: pass --pair fg.token:bg.token or --pairs file.json (all-pairs matrices are not supported)")
    if plain:
        modes = {"default": plain}
    if not modes:
        fail("no token files")
    failed = False
    for mode, files in modes.items():
        tokens = load(files)
        for p in pairs:
            (fg, fc), (bg, bc) = (color(resolve(tokens, p[k]), p[k]) for k in ("fg", "bg"))
            bgc = contrast.over(bg, [255, 255, 255, 1.0])
            fgc = contrast.over(fg, bgc)
            hi, lo = sorted((contrast.lum(fgc), contrast.lum(bgc)), reverse=True)
            ratio = (hi + 0.05) / (lo + 0.05)
            need = 3 if p.get("large") else 4.5
            failed |= ratio < need
            print(json.dumps({"mode": mode, "fg": p["fg"], "bg": p["bg"], "fg_hex": hexof(fgc), "bg_hex": hexof(bgc),
                              "ratio": contrast.shown(ratio), "need": need, "pass": ratio >= need, "clamped": fc or bc}))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
