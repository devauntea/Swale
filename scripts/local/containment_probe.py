"""Credential-free enforcement checks; live mode performs two reviewed public GETs."""
import errno
import json
import os
from pathlib import Path
import socket
import subprocess
import sys


def main():
    live = sys.argv[1] == "probe-live"
    results = {"environment_names": sorted(os.environ), "denials": {}}
    for kind in ("tcp", "udp", "marker"):
        try:
            if kind == "tcp":
                with socket.create_connection(("192.0.2.1", 443), timeout=1):
                    pass
            elif kind == "udp":
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
                    connection.sendto(b"nonsecret containment probe", ("192.0.2.1", 53))
            else:
                Path(os.environ["SWALE_LOCAL_MARKER"]).read_bytes()
            raise AssertionError("Expected enforced denial")
        except OSError as error:
            results["denials"][kind] = error.errno
            assert error.errno == errno.EPERM
    child_code = "import socket,errno,json\ntry: socket.create_connection(('192.0.2.1',443),timeout=1); raise AssertionError('not denied')\nexcept OSError as e: assert e.errno==errno.EPERM; print(json.dumps({'exec_child_tcp_errno':e.errno}))"
    results.update(json.loads(subprocess.check_output([sys.executable, "-I", "-S", "-c", child_code], text=True)))
    if live:
        import httpx
        with socket.create_connection(("127.0.0.1", 8001), timeout=5) as connection:
            connection.sendall(b"CONNECT denied.invalid:443 HTTP/1.1\r\nHost: denied.invalid:443\r\n\r\n")
            assert b"403" in connection.recv(100).split(b"\r\n")[0]
            results["unknown_proxy_target"] = 403
        results["public_gets"] = []
        for url in ("https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g", "https://api.weather.gov/points/40.6786,-73.9998"):
            try:
                response = httpx.get(url, headers={"User-Agent": "Swale-hackathon/0.1 (+https://github.com/devauntea/Swale)"}, timeout=25, follow_redirects=False)
                results["public_gets"].append({"url": url, "status": response.status_code, "bytes": len(response.content), "provider_date": response.headers.get("date"), "redirect": response.is_redirect})
            except httpx.HTTPError as error:
                results["public_gets"].append({"url": url, "error_type": type(error).__name__})
    print(json.dumps(results, indent=2), flush=True)
    if live:
        assert all(item.get("status") == 200 and not item.get("redirect") for item in results["public_gets"]), "Official public GET acceptance failed; see evidence above"


if __name__ == "__main__":
    main()
