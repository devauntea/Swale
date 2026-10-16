"""Bounded CONNECT broker; exact authorities are enforced here, TLS is end-to-end.

The native profile grants coarse TCP 443. It does not enforce a host/IP allowlist
or inspect encrypted HTTP methods/paths. Only reviewed GET clients are authorized.
"""
import ipaddress
import json
import os
import select
import socket
import socketserver
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler

ALLOWED = frozenset(("api-endpoint.mta.info:443", "api.weather.gov:443"))
LOCK = threading.Lock()
TUNNELS = threading.BoundedSemaphore(8)
RECENT = []
ADDRESSES = {}
LOG = None


def validate_addresses(addresses):
    if set(addresses) != {a.rsplit(":", 1)[0] for a in ALLOWED}:
        raise ValueError("Broker authorities must exactly match approved MTA/NWS hosts.")
    if any(not isinstance(ips, list) or not ips or len(ips) > 32 or any(not isinstance(ip, str) or not ipaddress.ip_address(ip).is_global for ip in ips) for ips in addresses.values()):
        raise ValueError("Broker destinations must be bounded nonempty public numeric address lists.")
    return addresses


def record(authority, result):
    # No headers, URLs, response bodies or credentials are logged.
    with LOCK, open(LOG, "a") as output:
        output.write(json.dumps({"time": time.time(), "authority": authority if authority in ALLOWED else "DENIED_TARGET", "result": result}) + "\n")


class Handler(BaseHTTPRequestHandler):
    timeout = 5
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def do_CONNECT(self):
        if self.path not in ALLOWED or self.headers.get("Proxy-Authorization"):
            record(self.path, "denied-before-resolution")
            self.send_error(403)
            return
        with LOCK:
            now = time.monotonic()
            RECENT[:] = [t for t in RECENT if now - t < 60]
            if len(RECENT) >= 30:
                self.send_error(429)
                return
            RECENT.append(now)
        if not TUNNELS.acquire(blocking=False):
            self.send_error(429)
            return
        host, upstream = self.path.rsplit(":", 1)[0], None
        try:
            addresses = [a for ip in ADDRESSES[host] for a in socket.getaddrinfo(ip, 443, type=socket.SOCK_STREAM, flags=socket.AI_NUMERICHOST)]
            last_error = None
            for family, kind, proto, _, address in addresses[:4]:
                upstream = socket.socket(family, kind, proto)
                upstream.settimeout(10)
                try:
                    upstream.connect(address)
                    break
                except OSError as error:
                    last_error = error
                    upstream.close()
                    upstream = None
            if upstream is None:
                raise last_error or OSError("No public address")
            self.send_response(200, "Connection established")
            self.end_headers()
            record(self.path, "connected")
            deadline, transferred = time.monotonic() + 60, 0
            while time.monotonic() < deadline:
                ready, _, _ = select.select([self.connection, upstream], [], [], 20)
                if not ready:
                    break
                for incoming in ready:
                    block = incoming.recv(65536)
                    if not block:
                        return
                    transferred += len(block)
                    if transferred > 32 * 1024 * 1024:
                        return
                    (upstream if incoming is self.connection else self.connection).sendall(block)
        except OSError as error:
            record(self.path, f"connection-error:{type(error).__name__}:{error.errno}")
            if upstream is None:
                self.send_error(502)
        finally:
            if upstream is not None:
                upstream.close()
            self.close_connection = True
            TUNNELS.release()

    def do_GET(self):
        self.send_error(405)

    do_POST = do_GET
    do_PUT = do_GET
    do_DELETE = do_GET
    do_HEAD = do_GET
    do_OPTIONS = do_GET


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = False


def main():
    global ADDRESSES, LOG
    from pathlib import Path
    if len(sys.argv) != 5:
        raise SystemExit("Broker is launched only by runtime.py with an inherited loopback listener.")
    descriptor, owner = int(sys.argv[1]), int(sys.argv[2])
    ADDRESSES = validate_addresses(json.loads(sys.argv[3]))
    LOG = Path(sys.argv[4])
    if not LOG.is_absolute() or LOG.is_symlink():
        raise SystemExit("BLOCK: unsafe broker log path.")

    def watch_owner():
        while os.getppid() == owner:
            time.sleep(1)
        os._exit(0)

    threading.Thread(target=watch_owner, daemon=True).start()
    server = Server(("127.0.0.1", 8001), Handler, bind_and_activate=False)
    server.socket.close()
    server.socket = socket.socket(fileno=descriptor)
    if server.socket.getsockname() != ("127.0.0.1", 8001):
        raise SystemExit("BLOCK: inherited broker listener is not fixed loopback8001.")
    server.server_address = server.socket.getsockname()
    server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    main()
