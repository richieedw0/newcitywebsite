from getpass import getpass

from backend import db


def main():
    db.init_db()
    username = input("Admin username: ").strip()
    password = getpass("New password: ")
    confirm = getpass("Type it again: ")
    if password != confirm:
        raise SystemExit("Passwords did not match.")
    db.change_admin_password(username, password)
    print("Password updated.")


if __name__ == "__main__":
    main()
