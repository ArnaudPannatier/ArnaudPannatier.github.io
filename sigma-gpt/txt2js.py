from pathlib import Path

if __name__ == "__main__":
    paths = list(Path(".").glob("*.txt"))

    lines = [p.read_text().splitlines() for p in paths]

    jss = ["console.log('recordings.js');", "const txt = {"]

    jss += [f"{p.stem} : {repr(ls)}," for p, ls in zip(paths, lines)]

    jss.append("}")

    Path("recordings.js").write_text("\n".join(jss))
