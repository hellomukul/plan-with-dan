"""Owner tools for the student database. Uses DATABASE_URL from .env (or the local SQLite file).

    python scripts/db_tools.py stats                 # row counts, which database is in use
    python scripts/db_tools.py backup                # JSON snapshot of every table -> backups/
    python scripts/db_tools.py backup --only EMAIL   # just one account's data (no sessions, no sample rows)
    python scripts/db_tools.py restore FILE.json     # load a snapshot into an EMPTY database
    python scripts/db_tools.py reset-password EMAIL  # set a new password for a friend (prompts, never echoes)

Typical move from the laptop to Neon: `backup` with no DATABASE_URL, then set DATABASE_URL to the
Neon URL and run `restore` on the file. Snapshots contain password hashes and emails: keep them
private (backups/ is gitignored).
"""

from __future__ import annotations

import getpass
import json
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import DateTime, text  # noqa: E402
from sqlmodel import Session, SQLModel, select  # noqa: E402

import db as dbmod  # noqa: E402
from db import AuthSession, User, engine, init_db  # noqa: E402

BACKUPS = ROOT / "backups"


def _tables():
    return SQLModel.metadata.sorted_tables  # parents before children, so restore respects foreign keys


def stats() -> None:
    init_db()
    print(f"database: {dbmod.storage_info()['engine']}  ({engine.url.render_as_string(hide_password=True)})")
    with engine.connect() as conn:
        for t in _tables():
            n = conn.execute(text(f'SELECT COUNT(*) FROM "{t.name}"')).scalar()
            print(f"  {t.name:<20} {n}")


def backup(only_email: str | None = None) -> Path:
    init_db()
    BACKUPS.mkdir(exist_ok=True)
    out: dict[str, list[dict]] = {}
    uid = None
    if only_email:
        from auth import normalise_email
        with Session(engine) as s:
            user = s.exec(select(User).where(User.email == normalise_email(only_email))).first()
        if not user:
            sys.exit("No account with that email.")
        uid = user.id
    with engine.connect() as conn:
        for t in _tables():
            q = t.select()
            if uid is not None:
                if t.name == "authsession":
                    continue  # sessions stay behind: the student signs in again on the new database
                q = q.where(t.c.id == uid) if t.name == "user" else q.where(t.c.user_id == uid)
            rows = [dict(r._mapping) for r in conn.execute(q)]
            if uid is not None and t.name == "bidreport":
                for r in rows:
                    r.pop("id", None)  # nothing references bid report ids; let the new database number them
            out[t.name] = rows
    tag = f"-only-user{uid}" if uid is not None else ""
    path = BACKUPS / f"plan-with-dan-{datetime.now():%Y%m%d-%H%M%S}{tag}.json"
    path.write_text(json.dumps({"format": 1, "tables": out}, default=lambda v: v.isoformat()
                               if isinstance(v, (date, datetime)) else str(v)))
    path.chmod(0o600)
    print(f"saved {sum(len(v) for v in out.values())} rows to {path.relative_to(ROOT)}")
    return path


def restore(file: str) -> None:
    init_db()
    data = json.loads(Path(file).read_text())["tables"]
    with engine.begin() as conn:
        if conn.execute(text('SELECT COUNT(*) FROM "user"')).scalar():
            sys.exit("Refusing to restore: this database already has accounts. Restore into an empty database.")
        for t in _tables():
            rows = data.get(t.name, [])
            for r in rows:
                for col in t.columns:  # turn ISO strings back into datetimes for DateTime columns
                    v = r.get(col.name)
                    if isinstance(v, str) and isinstance(getattr(col.type, "impl", col.type), DateTime):
                        r[col.name] = datetime.fromisoformat(v)
            if rows:
                conn.execute(t.insert(), rows)
            if engine.dialect.name == "postgresql":  # keep id sequences ahead of restored ids
                pk = [c for c in t.columns if c.primary_key and c.autoincrement is not False and c.type.__class__.__name__ in ('Integer', 'BigInteger')]
                if pk:
                    conn.execute(text(f"SELECT setval(pg_get_serial_sequence('\"{t.name}\"', '{pk[0].name}'), "
                                      f"COALESCE((SELECT MAX(\"{pk[0].name}\") FROM \"{t.name}\"), 1))"))
            print(f"  {t.name:<20} {len(rows)}")
    print("restore complete")


def reset_password(email: str) -> None:
    from auth import hasher, normalise_email, password_problem
    init_db()
    email = normalise_email(email)
    with Session(engine) as s:
        user = s.exec(select(User).where(User.email == email)).first()
        if not user:
            sys.exit("No account with that email.")
        pw = getpass.getpass("New password (not shown): ")
        if pw != getpass.getpass("Repeat it: "):
            sys.exit("The passwords don't match.")
        if problem := password_problem(pw, email):
            sys.exit(problem)
        user.password_hash = hasher.hash(pw)
        for sess in s.exec(select(AuthSession).where(AuthSession.user_id == user.id)).all():
            s.delete(sess)  # sign out everywhere
        s.add(user)
        s.commit()
    print("Password updated. Share it with your friend privately and ask them to sign in.")


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:] or ["stats"]
    if cmd == "stats":
        stats()
    elif cmd == "backup":
        backup(rest[1] if len(rest) == 2 and rest[0] == "--only" else None)
    elif cmd == "restore" and rest:
        restore(rest[0])
    elif cmd == "reset-password" and rest:
        reset_password(rest[0])
    else:
        print(__doc__)
