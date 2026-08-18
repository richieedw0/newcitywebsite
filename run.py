from os import environ
from pathlib import Path

from backend.server import run


def load_env_file():
    env_path = Path(".env")
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        clean = line.strip()
        if not clean or clean.startswith("#") or "=" not in clean:
            continue
        key, value = clean.split("=", 1)
        environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


if __name__ == "__main__":
    load_env_file()
    default_host = "0.0.0.0" if environ.get("NEW_CITY_ENV", "").lower() == "production" else "127.0.0.1"
    run(host=environ.get("HOST", default_host), port=int(environ.get("PORT", "4173")))
