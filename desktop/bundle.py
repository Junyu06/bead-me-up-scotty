"""Build a local macOS app bundle; no private configuration goes into it."""
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path
root = Path(__file__).resolve().parent
subprocess.run(["cargo", "build", "--release", "--locked", "--manifest-path", str(root / "Cargo.toml")], check=True)
app = Path(sys.argv[1]).resolve()
if app.suffix != ".app":
    raise SystemExit("Destination must end in .app")
contents = app / "Contents"
(contents / "MacOS").mkdir(parents=True, exist_ok=True)
(contents / "Resources").mkdir(parents=True, exist_ok=True)
shutil.copy2(root / "target/release/scotty-desktop", contents / "MacOS/scotty-desktop")
with (contents / "Info.plist").open("wb") as f:
    plistlib.dump({"CFBundleExecutable": "scotty-desktop", "CFBundleIdentifier": "com.beadmeupscotty.desktop", "CFBundleName": "Scotty", "CFBundleDisplayName": "Scotty", "CFBundlePackageType": "APPL", "CFBundleShortVersionString": "0.1.0", "CFBundleVersion": "1", "LSMinimumSystemVersion": "10.15", "NSHighResolutionCapable": True}, f)
for attribute in ("com.apple.FinderInfo", "com.apple.ResourceFork"):
    subprocess.run(["xattr", "-r", "-d", attribute, str(app)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
subprocess.run(["codesign", "--force", "--deep", "--sign", "-", str(app)], check=True)
print(app)
