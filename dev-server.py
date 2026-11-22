"""Static dev server for local development.

Two things the stdlib's http.server does not do, both of which this project
needs:

1. HTTP Range requests. SimpleHTTPRequestHandler ignores Range and returns the
   whole file with a 200. A <video> being scrubbed by scroll seeks constantly,
   and without 206 responses those seeks stall - the element drops back to
   HAVE_METADATA and never recovers.

2. Selective caching. Sending no-store for everything keeps edited HTML, CSS and
   JS honest, but applied to media it also forbids the browser from holding on
   to any of the video, so every seek starts again from nothing. Markup and code
   are told not to cache; media and fonts are allowed to.

Development only. Real hosting should cache hard and version its assets.
"""

import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# The files being edited: never cached, so a plain reload is always enough.
VOLATILE = {".html", ".htm", ".css", ".js", ".mjs", ".json", ".map"}

RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")
CHUNK = 64 * 1024


class DevHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive, which media loading depends on

    def _local_path(self):
        return self.translate_path(self.path.split("?", 1)[0].split("#", 1)[0])

    def end_headers(self):
        """Called exactly once per response, so headers land on every reply."""
        ext = os.path.splitext(self._local_path())[1].lower()
        if ext in VOLATILE:
            self.send_header("Cache-Control", "no-store, must-revalidate")
        else:
            # Media and fonts must be cacheable or seeking re-downloads them.
            self.send_header("Cache-Control", "public, max-age=300")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def do_GET(self):
        served = self._range_request()
        if not served:
            super().do_GET()

    def _range_request(self):
        header = self.headers.get("Range")
        if not header:
            return False

        match = RANGE_RE.match(header.strip())
        if not match:
            return False

        path = self._local_path()
        if not os.path.isfile(path):
            return False

        size = os.path.getsize(path)
        first, last = match.group(1), match.group(2)

        if first == "":
            if last == "":
                return False
            length = min(int(last), size)
            start, end = size - length, size - 1
        else:
            start = int(first)
            end = int(last) if last else size - 1

        if start >= size:
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % size)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return True

        end = min(end, size - 1)
        length = end - start + 1

        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Length", str(length))
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.end_headers()

        with open(path, "rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining > 0:
                block = handle.read(min(CHUNK, remaining))
                if not block:
                    break
                try:
                    self.wfile.write(block)
                except (BrokenPipeError, ConnectionResetError):
                    return True  # the element moved on; nothing to report
                remaining -= len(block)
        return True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173

    # Every interface, not just loopback, so a phone on the same network can
    # reach it. This is a development server on a local network and nothing
    # more - it is not hardened, and should never be exposed beyond one.
    host = sys.argv[2] if len(sys.argv) > 2 else "0.0.0.0"

    print("serving %s on http://%s:%d" % (os.getcwd(), host, port), flush=True)
    ThreadingHTTPServer((host, port), DevHandler).serve_forever()
