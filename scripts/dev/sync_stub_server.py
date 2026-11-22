"""A tiny fake Supabase for testing features/sync.js on a PC (no account needed).

Run:  python scripts/dev/sync_stub_server.py   (listens on http://localhost:8787)
Then in the app: Settings -> Sync -> Server details: URL http://localhost:8787, key "stub".
Sign in with any email; the code is always 123456 (also printed here).
It imitates only what sync.js uses: /auth/v1/otp, /auth/v1/verify, /auth/v1/token,
and /rest/v1/jarvis_data + /rest/v1/jarvis_backups (select / filter / upsert), per user.
Data lives in memory and is lost when it stops. GET /_dump shows everything; POST /_offline toggles failures.
"""
import json, time, uuid, sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

USERS = {}      # email -> uid
TOKENS = {}     # token -> uid
TABLES = {"jarvis_data": {}, "jarvis_backups": {}}   # table -> {(uid, key): row}
KEYCOL = {"jarvis_data": "ns", "jarvis_backups": "day"}
STATE = {"down": False}


def ts():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

    def reply(self, code, obj=None):
        body = b"" if obj is None else json.dumps(obj).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"null")

    def uid(self):
        a = self.headers.get("Authorization", "")
        return TOKENS.get(a.replace("Bearer ", ""))

    def session(self, uid, email):
        tok, ref = uuid.uuid4().hex, uuid.uuid4().hex
        TOKENS[tok] = uid
        TOKENS["r:" + ref] = uid
        return {"access_token": tok, "refresh_token": ref, "expires_in": 3600, "user": {"id": uid, "email": email}}

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/_dump":
            return self.reply(200, {t: [r for r in rows.values()] for t, rows in TABLES.items()})
        if STATE["down"]:
            return self.reply(503, {"message": "down"})
        if not u.path.startswith("/rest/v1/"):
            return self.reply(404, {"message": "no"})
        uid = self.uid()
        if not uid:
            return self.reply(401, {"message": "JWT expired"})
        t = u.path.split("/")[-1]
        q = parse_qs(u.query)
        rows = [r for (ru, _), r in TABLES[t].items() if ru == uid]   # row-level security
        for col, vals in q.items():
            if col in ("select", "order", "limit"):
                continue
            op, _, val = vals[0].partition(".")
            if op == "gt":
                rows = [r for r in rows if str(r[col]) > val]
            elif op == "eq":
                rows = [r for r in rows if str(r[col]) == val]
        if "order" in q:
            col, _, d = q["order"][0].partition(".")
            rows.sort(key=lambda r: r[col], reverse=d == "desc")
        if "limit" in q:
            rows = rows[: int(q["limit"][0])]
        cols = q.get("select", ["*"])[0].split(",")
        if cols != ["*"]:
            rows = [{c: r[c] for c in cols} for r in rows]
        return self.reply(200, rows)

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/_offline":
            STATE["down"] = not STATE["down"]
            return self.reply(200, STATE)
        if STATE["down"]:
            return self.reply(503, {"message": "down"})
        b = self.body()
        if u.path == "/auth/v1/otp":
            print("code for", b["email"], "= 123456", flush=True)
            return self.reply(200, {})
        if u.path == "/auth/v1/verify":
            if b.get("token") != "123456":
                return self.reply(403, {"msg": "Token has expired or is invalid"})
            uid = USERS.setdefault(b["email"].lower(), str(uuid.uuid4()))
            return self.reply(200, self.session(uid, b["email"]))
        if u.path == "/auth/v1/token":
            uid = TOKENS.get("r:" + b.get("refresh_token", ""))
            if not uid:
                return self.reply(400, {"msg": "Invalid Refresh Token"})
            email = next(e for e, i in USERS.items() if i == uid)
            return self.reply(200, self.session(uid, email))
        if u.path.startswith("/rest/v1/"):
            uid = self.uid()
            if not uid:
                return self.reply(401, {"message": "JWT expired"})
            t = u.path.split("/")[-1]
            for r in b:
                if r.get("user_id", uid) != uid:          # RLS "with check"
                    return self.reply(403, {"message": "new row violates row-level security policy"})
                r["user_id"] = uid
                r["server_at"] = ts()
                TABLES[t][(uid, r[KEYCOL[t]])] = r
            return self.reply(201)
        return self.reply(404, {"message": "no"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    print("sync stub on http://localhost:%d" % port, flush=True)
    ThreadingHTTPServer(("", port), H).serve_forever()
