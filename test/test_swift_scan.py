"""Self-check for scripts/swift_scan.py. Run: python3 -I test/test_swift_scan.py"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "scripts", "swift_scan.py")
FIX = os.path.join(HERE, "fixtures", "swift")


def run(*args):
    p = subprocess.run([sys.executable, "-I", SCRIPT, *args], capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


code, out, err = run(FIX)
assert code == 0, err
r = json.loads(out)
got = sorted((f["rule"], f["file"], f["line"]) for f in r["findings"])
want = sorted([
    ("fixed-font", "App/Views.swift", 6),
    ("asset-image-button", "App/Views.swift", 10),
    ("tap-gesture", "App/Views.swift", 17),
    ("dynamic-type-cap", "App/Views.swift", 21),
    ("fixed-font", "App/Legacy.swift", 3),
    ("rn-font-scaling", "App/Card.tsx", 1),
])
assert got == want, json.dumps(got, indent=1)
p = r["project"]
assert p["deployment_targets"] == {"ios": 17.0}, p
assert p["last_upgrade_check"] == 2600 and p["opt_out"] is True and p["sdk"] is None, p
# Xcode 26 with the opt-out, SDK unconfirmed: gate fails and says it is unverified.
assert r["gate"]["run"] is False and r["gate"]["unverified"] is True, r["gate"]

# A built app linked against the 27 SDK ignores the opt-out: the gate runs.
code, out, err = run(FIX, "--app", os.path.join(FIX, "Built.app"))
r = json.loads(out)
assert r["project"]["sdk"] == "iphonesimulator27.2" and r["project"]["xcode"] == "2720", r["project"]
assert r["gate"]["run"] is True and "ignore the opt-out" in r["gate"]["basis"], r["gate"]

code, _, err = run("/nonexistent/dir")
assert code == 2 and "not a directory" in err, (code, err)
print("swift_scan: ok")
