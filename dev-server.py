#!/usr/bin/env python3
"""Local dev server that replicates vercel.json's route rewrites, the /api/surveys
listing endpoint AND the /api/track telemetry ingest, so local testing matches production.

python -m http.server has no concept of rewrites, so /enterprise, /card-tour and /survey
would 404 locally even though they work on Vercel. It also has no API, so the survey
listing wouldn't populate and telemetry would have nowhere to go. This mirrors all of it.

  - GET  /api/surveys  -> same JSON contract as api/surveys.js
  - POST /api/track    -> appends each event as one JSON line to logs/survey-events.jsonl
                          (api/track.js writes to Neon Postgres in production; here we use a
                          local json log so you can watch events land with zero setup)
"""
import http.server
import socketserver
import json
import os
import re
import datetime
import urllib.parse

ROUTES = {
    "/": "/views/render/index.html",        # the city-build intro opens the site
    "/home": "/views/home/index.html",
    "/classic": "/views/main/index.html",
    "/enterprise": "/views/enterprise/index.html",
    "/card-tour": "/views/card-tour/index.html",
    "/survey": "/survey.html",
    "/data-center": "/views/data-center/index.html",
    "/render": "/views/render/index.html",
    "/explore": "/views/explore/index.html",
}

SURVEY_DIR = "surds survey"
LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, "survey-events.jsonl")


def _meta_attr(head, name):
    # Find the <meta> tag whose name matches, then read its content — delimiter-aware so a
    # double-quoted value may contain apostrophes (e.g. "we'll") and vice versa.
    for tag in re.findall(r"<meta\b[^>]*>", head, re.I):
        nm = re.search(r"""\bname\s*=\s*(["'])([\s\S]*?)\1""", tag, re.I)
        if nm and nm.group(2).lower() == name.lower():
            cm = re.search(r"""\bcontent\s*=\s*(["'])([\s\S]*?)\1""", tag, re.I)
            return cm.group(2).strip() if cm else ""
    return ""


def _survey_meta(full, filename):
    head = ""
    try:
        with open(full, "r", encoding="utf-8", errors="ignore") as fh:
            head = fh.read(8192)
    except OSError:
        pass
    hidden = _meta_attr(head, "survey:hidden").lower() in ("1", "true", "yes")
    tt = re.search(r"<title>([\s\S]*?)</title>", head, re.I)
    title = _meta_attr(head, "survey:title") or (tt.group(1).strip() if tt else "")
    title = re.sub(r"^\s*surds\s*[|—·:\-]\s*", "", title, flags=re.I).strip()
    if not title:
        title = re.sub(r"[._-]+", " ", re.sub(r"\.dc\.html$|\.html$", "", filename, flags=re.I)).strip()
    description = _meta_attr(head, "survey:description") or _meta_attr(head, "description")
    return title, description, hidden


def survey_list():
    """List every real survey .html file in the survey folder — the same contract that
    api/surveys.js returns on Vercel. Skips Framer/component exports (*.dc.html) and dotfiles,
    and pulls each card's title/description from the file itself so /survey shows what it is."""
    surveys = []
    try:
        entries = os.listdir(SURVEY_DIR)
    except OSError:
        entries = []
    for f in entries:
        low = f.lower()
        if not low.endswith(".html") or low.endswith(".dc.html") or f.startswith("."):
            continue
        full = os.path.join(SURVEY_DIR, f)
        try:
            st = os.stat(full)
            size = st.st_size
            updated = datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc).isoformat()
        except OSError:
            size, updated = 0, None
        title, description, hidden = _survey_meta(full, f)
        if hidden:
            continue
        url = "/" + urllib.parse.quote(SURVEY_DIR) + "/" + urllib.parse.quote(f)
        surveys.append({"title": title, "description": description, "file": f,
                        "url": url, "size": size, "updated": updated})
    surveys.sort(key=lambda s: s["updated"] or "", reverse=True)
    return surveys


def store_events(payload):
    """Append each event as one JSON line to logs/survey-events.jsonl (the local mirror of
    api/track.js's Postgres insert). Returns how many events were written."""
    os.makedirs(LOG_DIR, exist_ok=True)
    sid = payload.get("s") or payload.get("session") or ""
    survey = payload.get("survey") or "unknown"
    events = payload.get("events") or []
    if not isinstance(events, list):
        return 0
    received = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with open(LOG_FILE, "a", encoding="utf-8") as fh:
        for e in events:
            rec = {"session": sid, "survey": survey, "received": received, "event": e}
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return len(events)


class RewriteHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # local dev: never let the browser serve a stale page/asset after an edit
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/track":
            try:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                payload = json.loads(raw.decode("utf-8") or "{}")
                n = store_events(payload)
                self._json(200, {"ok": True, "stored": n})
            except Exception as exc:  # telemetry must never 500 the client
                self._json(200, {"ok": False, "error": str(exc)})
            return
        self.send_error(404, "Not found")

    # Only the files the website itself loads are served. Everything else in the
    # repo (.env, scripts, logs, CAD/Blender sources) stays private, which matters
    # as soon as this server is exposed through a tunnel.
    PUBLIC_PREFIXES = ("/views/", "/shared/", "/models/", "/surds%20survey/", "/surds survey/")
    PUBLIC_FILES = ("/survey.html", "/living_room_interior_free.glb", "/favicon.ico")

    def _is_public(self, path):
        path = urllib.parse.unquote(path)
        if "/." in path or ".." in path:
            return False
        return path in ROUTES or path == "/api/surveys" or path in self.PUBLIC_FILES or path.startswith(self.PUBLIC_PREFIXES)

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    def do_HEAD(self):
        path = self.path.split("?", 1)[0]
        if not self._is_public(path):
            self.send_error(404, "Not found")
            return
        if path in ROUTES:
            self.path = ROUTES[path]
        return super().do_HEAD()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if not self._is_public(path):
            self.send_error(404, "Not found")
            return
        if path == "/api/surveys":
            self._json(200, {"surveys": survey_list()})
            return
        if path in ROUTES:
            self.path = ROUTES[path]
        return super().do_GET()


PORT = 8000
if __name__ == "__main__":
    # threaded: one slow/keep-alive connection (e.g. a large GLB) must not block every other request
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    with socketserver.ThreadingTCPServer(("", PORT), RewriteHandler) as httpd:
        print(f"Serving on http://localhost:{PORT} (routes + /api/surveys + /api/track)")
        httpd.serve_forever()
