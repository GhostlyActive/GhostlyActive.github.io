"""
Local preview server that forbids caching.

Python's stock http.server sends Last-Modified, which lets a browser keep old
CSS and JS for a while and serve a mix of old and new files after an edit.
Everything here goes out with Cache-Control: no-store instead.

    python3 tools/serve.py 4173
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
