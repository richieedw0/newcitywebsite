from datetime import datetime
from pathlib import Path
from shutil import copy2

from backend import db


def main():
    db.init_db()
    source = db.DB_PATH
    backup_dir = Path("backups")
    backup_dir.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    destination = backup_dir / f"new_city-{timestamp}.sqlite3"
    copy2(source, destination)
    print(f"Backup saved: {destination}")


if __name__ == "__main__":
    main()
