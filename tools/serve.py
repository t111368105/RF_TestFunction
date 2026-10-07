"""Local preview server for site/ with caching disabled.

Python's plain http.server lets browsers cache files heuristically, so after an edit a phone can mix
a new module with an old cached one and the page fails to start. This server sends no-store instead.

    python tools/serve.py          # this computer only: http://localhost:8080
    python tools/serve.py --lan    # also reachable from phones on the same network
"""

import argparse
import functools
import http.server
import socket
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def lan_address():
    # Connecting a UDP socket sends nothing; it only selects the outgoing interface.
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("192.0.2.1", 80))
            return s.getsockname()[0]
        except OSError:
            return None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--lan", action="store_true", help="listen on all interfaces for phone testing")
    args = parser.parse_args()

    host = "0.0.0.0" if args.lan else "127.0.0.1"
    handler = functools.partial(NoCacheHandler, directory=str(SITE))
    with http.server.ThreadingHTTPServer((host, args.port), handler) as server:
        print(f"Serving {SITE} with caching disabled")
        print(f"  This computer: http://localhost:{args.port}")
        if args.lan:
            ip = lan_address()
            print(f"  Phone (same network): http://{ip or '<this computer IP>'}:{args.port}")
        print("Press Ctrl+C to stop.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
