"""Install the two reviewed skill folders without overwriting different existing files."""
import os
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
targets = [root / ".agents" / "skills", Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))) / "skills"]
names = ["dedalo-live-canvas", "dedalo-nk-analysis"]
# Check every destination before writing anything.
for target in targets:
    for name in names:
        source = root / "skills" / name
        dest = target / name
        if dest.is_symlink():
            raise SystemExit(f"Refusing to replace symlink: {dest}")
        if dest.exists():
            old = {p.relative_to(dest): p.read_bytes() for p in dest.rglob("*") if p.is_file()}
            new = {p.relative_to(source): p.read_bytes() for p in source.rglob("*") if p.is_file()}
            if old != new:
                raise SystemExit(f"Different skill already exists; review before replacing: {dest}")
for target in targets:
    for name in names:
        dest = target / name
        if not dest.exists():
            shutil.copytree(root / "skills" / name, dest)
        print(f"Installed and verified: {dest}")
        for p in (root / "skills" / name).rglob("*"):
            if p.is_file():
                assert p.read_bytes() == (dest / p.relative_to(root / "skills" / name)).read_bytes()
