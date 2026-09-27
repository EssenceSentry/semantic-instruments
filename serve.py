"""Serve the built laboratory locally, including headers for threaded WebAssembly."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

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

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8773)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parent / "site")
    args = parser.parse_args()
    if not (args.directory / "index.html").is_file():
        parser.error("Build the app first, or point --directory to the unpacked site.")
    print(f"Semantic Instruments: http://127.0.0.1:{args.port}/", flush=True)
    LabServer(("127.0.0.1", args.port), partial(Handler, directory=str(args.directory))).serve_forever()
