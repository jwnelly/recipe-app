#!/usr/bin/env python3
"""Recipe Box — simple HTTP server using only Python stdlib."""

import json
import mimetypes
import os
import re
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = 3000
DATA_FILE = Path(__file__).parent / "recipes.json"
PUBLIC_DIR = Path(__file__).parent / "public"


# ── Data helpers ──────────────────────────────────────────────────────────────

def load_recipes() -> list:
    if not DATA_FILE.exists():
        return []
    with open(DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_recipes(recipes: list) -> None:
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(recipes, f, indent=2, ensure_ascii=False)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Request handler ───────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")

    # ── helpers ──

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status, message):
        self.send_json({"error": message}, status)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return None
        raw = self.rfile.read(length)
        return json.loads(raw)

    def parsed_url(self):
        return urlparse(self.path)

    def query_params(self):
        return parse_qs(self.parsed_url().query)

    def qs(self, key) -> str:
        """Return first value of a query param, or empty string."""
        return self.query_params().get(key, [""])[0]

    # ── routing ──

    def do_GET(self):
        path = self.parsed_url().path

        if path == "/api/recipes":
            self._get_recipes()
        elif path == "/api/tags":
            self._get_tags()
        elif path == "/api/export":
            self._export()
        elif path.startswith("/api/"):
            self.send_error_json(404, "Not found")
        else:
            self._serve_static(path)

    def do_POST(self):
        path = self.parsed_url().path

        if path == "/api/recipes":
            self._create_recipe()
        elif path == "/api/import":
            self._import_recipes()
        else:
            self.send_error_json(404, "Not found")

    def do_PUT(self):
        m = re.match(r"^/api/recipes/([^/]+)$", self.parsed_url().path)
        if m:
            self._update_recipe(m.group(1))
        else:
            self.send_error_json(404, "Not found")

    def do_DELETE(self):
        m = re.match(r"^/api/recipes/([^/]+)$", self.parsed_url().path)
        if m:
            self._delete_recipe(m.group(1))
        else:
            self.send_error_json(404, "Not found")

    # ── static file serving ──

    def _serve_static(self, path):
        # Default to index.html for root
        if path == "/" or path == "":
            path = "/index.html"

        file_path = PUBLIC_DIR / path.lstrip("/")

        # Safety: don't escape the public dir
        try:
            file_path = file_path.resolve()
            PUBLIC_DIR.resolve()
            file_path.relative_to(PUBLIC_DIR.resolve())
        except ValueError:
            self.send_error_json(403, "Forbidden")
            return

        if not file_path.exists() or not file_path.is_file():
            self.send_error_json(404, "Not found")
            return

        mime, _ = mimetypes.guess_type(str(file_path))
        mime = mime or "application/octet-stream"
        data = file_path.read_bytes()

        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ── API handlers ──

    def _get_recipes(self):
        recipes = load_recipes()
        search = self.qs("search").lower()
        tag = self.qs("tag")

        if search:
            def matches(r):
                return (
                    search in r.get("title", "").lower()
                    or search in r.get("description", "").lower()
                    or any(search in i.lower() for i in r.get("ingredients", []))
                )
            recipes = [r for r in recipes if matches(r)]

        if tag:
            recipes = [r for r in recipes if tag in r.get("tags", [])]

        self.send_json(recipes)

    def _get_tags(self):
        recipes = load_recipes()
        tags = sorted({t for r in recipes for t in r.get("tags", [])})
        self.send_json(tags)

    def _create_recipe(self):
        body = self.read_json_body()
        if body is None:
            self.send_error_json(400, "Empty body")
            return
        recipes = load_recipes()
        recipe = {
            "id": str(uuid.uuid4()),
            **body,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        recipes.append(recipe)
        save_recipes(recipes)
        self.send_json(recipe, 201)

    def _update_recipe(self, recipe_id):
        body = self.read_json_body()
        if body is None:
            self.send_error_json(400, "Empty body")
            return
        recipes = load_recipes()
        idx = next((i for i, r in enumerate(recipes) if r["id"] == recipe_id), None)
        if idx is None:
            self.send_error_json(404, "Recipe not found")
            return
        recipes[idx] = {
            **recipes[idx],
            **body,
            "id": recipe_id,
            "createdAt": recipes[idx].get("createdAt", now_iso()),
            "updatedAt": now_iso(),
        }
        save_recipes(recipes)
        self.send_json(recipes[idx])

    def _delete_recipe(self, recipe_id):
        recipes = load_recipes()
        filtered = [r for r in recipes if r["id"] != recipe_id]
        if len(filtered) == len(recipes):
            self.send_error_json(404, "Recipe not found")
            return
        save_recipes(filtered)
        self.send_response(204)
        self.end_headers()

    def _export(self):
        recipes = load_recipes()
        body = json.dumps(recipes, indent=2, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Disposition", 'attachment; filename="recipes.json"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _import_recipes(self):
        body = self.read_json_body()
        if not body or not isinstance(body.get("recipes"), list):
            self.send_error_json(400, 'Expected { "recipes": [...], "mode": "merge"|"replace" }')
            return

        incoming = body["recipes"]
        mode = body.get("mode", "merge")

        stamped = [
            {
                **r,
                "id": r.get("id") or str(uuid.uuid4()),
                "createdAt": r.get("createdAt") or now_iso(),
                "updatedAt": r.get("updatedAt") or now_iso(),
            }
            for r in incoming
        ]

        if mode == "replace":
            save_recipes(stamped)
            self.send_json({"imported": len(stamped), "mode": "replace"})
            return

        existing = load_recipes()
        existing_ids = {r["id"] for r in existing}
        new_ones = [r for r in stamped if r["id"] not in existing_ids]
        save_recipes(existing + new_ones)
        self.send_json({
            "imported": len(new_ones),
            "skipped": len(stamped) - len(new_ones),
            "mode": "merge",
        })


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    server = HTTPServer(("", PORT), Handler)
    print(f"Recipe Box running at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
