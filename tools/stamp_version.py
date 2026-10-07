"""Add ?v=<version> to every local module and stylesheet reference before deploying.

GitHub Pages lets browsers cache files for 10 minutes. Without a version, a browser can combine a
new module with an old cached one after a deploy, and the page fails to start. Stamping every
reference gives each deploy its own set of URLs.

    python tools/stamp_version.py site <version>

Rewrites site/index.html and site/*.mjs in place, then checks that every local .mjs/.css reference
is stamped and points to an existing file; exits with an error otherwise.
"""

import re
import sys
from pathlib import Path

# A quoted relative path to a local module or stylesheet, e.g. './ui.mjs' or "./style.css".
REFERENCE = re.compile(r"""(['"])(\./[\w.-]+\.(?:mjs|css))(\?v=[\w.-]+)?\1""")


def stamp(site: Path, version: str) -> int:
    files = [site / "index.html", *sorted(site.glob("*.mjs"))]
    count = 0
    for path in files:
        text = path.read_text(encoding="utf-8")

        def add_version(m):
            nonlocal count
            count += 1
            return f"{m[1]}{m[2]}?v={version}{m[1]}"

        path.write_text(REFERENCE.sub(add_version, text), encoding="utf-8", newline="\n")
    return count


def check(site: Path, version: str) -> list[str]:
    problems = []
    for path in [site / "index.html", *sorted(site.glob("*.mjs"))]:
        text = path.read_text(encoding="utf-8")
        for m in REFERENCE.finditer(text):
            if m[3] != f"?v={version}":
                problems.append(f"{path.name}: {m[2]} is not stamped")
            if not (site / m[2]).is_file():
                problems.append(f"{path.name}: {m[2]} does not exist")
        # Any other local module reference (e.g. an unusual import form) would escape the stamp.
        for ref in re.findall(r"""['"](\.{1,2}/[^'"?]+\.(?:mjs|css))['"]""", text):
            problems.append(f"{path.name}: unrecognized reference {ref}")
    return problems


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    site, version = Path(sys.argv[1]), sys.argv[2]
    if not re.fullmatch(r"[\w.-]+", version):
        sys.exit(f"Invalid version: {version!r}")
    count = stamp(site, version)
    problems = check(site, version)
    if problems:
        sys.exit("Version stamp check failed:\n  " + "\n  ".join(problems))
    print(f"Stamped {count} references with ?v={version}")


if __name__ == "__main__":
    main()
