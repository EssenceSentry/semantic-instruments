"""Serve the built laboratory locally, including headers for threaded WebAssembly."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import errno
import webbrowser

PORT_ATTEMPTS = 20

class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        # Keep normal asset traffic quiet; retain actual HTTP errors.
        if len(args) > 1 and str(args[1]).startswith(("4", "5")):
            super().log_message(format, *args)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".wasm"):
            return "application/wasm"
        if path.endswith(".f32.gz"):
            return "application/octet-stream"
        return super().guess_type(path)

class LabServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True

def bind(port, handler):
    """The server on the first free port from `port` on; port 0 lets the system choose."""
    for candidate in range(port, port + PORT_ATTEMPTS) if port else [0]:
        try:
            return LabServer(("127.0.0.1", candidate), handler)
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
    raise SystemExit(f"Ports {port} to {port + PORT_ATTEMPTS - 1} are all in use. Choose another with --port.")

def main(default_directory):
    parser = argparse.ArgumentParser(description="Serve the built laboratory on this computer.")
    parser.add_argument("--port", type=int, default=8773, help="first port to try; if it is taken, the next free one is used")
    parser.add_argument("--directory", type=Path, default=default_directory)
    parser.add_argument("--open", action="store_true", help="open the lab in the default browser")
    args = parser.parse_args()
    if not (args.directory / "index.html").is_file():
        raise SystemExit(f"{args.directory / 'index.html'} is missing. Run npm ci and npm run build:site first, or point --directory to the unpacked site.")
    server = bind(args.port, partial(Handler, directory=str(args.directory)))
    port = server.server_address[1]
    if args.port and port != args.port:
        print(f"Port {args.port} is in use, so the lab uses port {port}.", flush=True)
    url = f"http://127.0.0.1:{port}/"
    print(f"Semantic Instruments: {url}", flush=True)
    print("Keep this window open while you use the lab. Press Control-C to stop.", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)
    finally:
        server.server_close()

if __name__ == "__main__":
    main(Path(__file__).resolve().parent / "site")
