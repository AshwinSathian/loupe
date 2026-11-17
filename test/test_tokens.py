"""Self-check for scripts/tokens.py. Run: python3 -I test/test_tokens.py"""
import importlib.util, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "scripts", "tokens.py")
T = lambda f: os.path.join(HERE, "fixtures", "tokens", f)
spec = importlib.util.spec_from_file_location("tokens", SCRIPT)
tokens = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tokens)


def run(*args):
    p = subprocess.run([sys.executable, "-I", SCRIPT, *args], capture_output=True, text=True)
    return p.returncode, [json.loads(l) for l in p.stdout.splitlines()], p.stderr


# Conversions against known CSS Color 4 values, within 1 of 255 per channel.
def close(space, comps, want, tol=1.0):
    got = [min(max(v, 0), 1) * 255 for v in tokens.to_srgb(space, comps)]
    assert all(abs(g - w) <= tol for g, w in zip(got, want)), (space, comps, got, want)

close("srgb", [1, 0.5, 0], [255, 127.5, 0])
close("srgb-linear", [0.21586, 0.21586, 0.21586], [128, 128, 128])
close("hsl", [120, 100, 25], [0, 127.5, 0])
close("hwb", [0, 20, 20], [204, 51, 51])
close("display-p3", [0.5, 0.5, 0.5], [128, 128, 128])
close("oklch", [0.62796, 0.25768, 29.234], [255, 0, 0])
close("oklab", [1.0, 0, 0], [255, 255, 255])
close("lab", [54.2905, 80.8049, 69.891], [255, 0, 0], tol=1.5)
close("lch", [54.2905, 106.8372, 40.8526], [255, 0, 0], tol=1.5)
close("xyz-d65", [0.95047, 1.0, 1.08883], [255, 255, 255])
assert tokens.to_srgb("rec2020", [0.5, 0.5, 0.5]) is None

# Two modes, declared pairs, aliases, hex fallback, P3 clamping.
code, rows, err = run("--mode", f"light={T('base.json')}", "--mode", f"dark={T('base.json')},{T('dark.json')}",
                      "--pair", "color.text.primary:color.bg.surface", "--pair", "color.text.muted:color.bg.surface",
                      "--pair", "color.text.brand:color.bg.surface", "--pair", "color.base.rare:color.bg.surface")
assert code == 1, err  # muted grey fails on white
by = {(r["mode"], r["fg"]): r for r in rows}
assert len(rows) == 8, rows
assert by[("light", "color.text.primary")]["fg_hex"] == "#1a1a1f" and by[("light", "color.text.primary")]["pass"]
assert by[("dark", "color.text.primary")]["fg_hex"] == "#f2f2f2" and by[("dark", "color.text.primary")]["pass"]
assert not by[("light", "color.text.muted")]["pass"], by[("light", "color.text.muted")]
assert by[("light", "color.text.brand")]["clamped"] is True and by[("light", "color.text.brand")]["fg_hex"] == "#ff0000"
assert by[("light", "color.base.rare")]["fg_hex"] == "#777777"

code, _, err = run(T("cycle.json"), "--pair", "a:b")
assert code == 2 and "cycle" in err, err
code, _, err = run(T("base.json"))
assert code == 2 and "all-pairs" in err, err
code, _, err = run(T("base.json"), "--pair", "color.nope:color.bg.surface")
assert code == 2 and "unknown token color.nope" in err, err
print("tokens: ok")

# A translucent surface needs --base; over a dark base, light text passes.
code, _, err = run(T("glass.json"), "--pair", "color.text:color.glass")
assert code == 2 and "--base" in err, err
code, rows, err = run(T("glass.json"), "--base", "color.surface", "--pair", "color.text:color.glass")
assert code == 0 and rows[0]["pass"] and rows[0]["bg_hex"] == "#202020", rows
print("tokens base: ok")
