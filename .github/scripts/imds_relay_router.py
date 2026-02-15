#!/usr/bin/env python3
"""
IMDS Relay Router — GitHub Actions in-container proxy.

Runs as a background process inside the devcontainer. Listens on
0.0.0.0:8080.

az login --identity reaches this via IDENTITY_ENDPOINT=http://localhost:8080/...

Env vars:

  IMDS_RELAY_URL        — e.g. https://<ns>.servicebus.windows.net/<path>/token
  IMDS_RELAY_SENDER_KEY — SAS key with Send claim on the hybrid connection

"""

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

LISTEN_PORT = int(os.environ.get("IMDS_ROUTER_PORT", "8080"))
RELAY_URL = os.environ.get("IMDS_RELAY_URL", "")
RELAY_SENDER_KEY = os.environ.get("IMDS_RELAY_SENDER_KEY", "")
IDENTITY_HEADER_VALUE = os.environ.get("IDENTITY_HEADER", "local-dev-secret")


def _generate_sas_token(uri: str, key: str, key_name: str = "sender", expiry_seconds: int = 3600) -> str:
    """Generate a SharedAccessSignature token for Azure Relay."""
    expiry = int(time.time()) + expiry_seconds
    string_to_sign = f"{urllib.parse.quote_plus(uri)}\n{expiry}"
    sig = hmac.new(key.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha256).digest()
    sig_b64 = urllib.parse.quote_plus(base64.b64encode(sig).decode("utf-8"))
    return f"SharedAccessSignature sr={urllib.parse.quote_plus(uri)}&sig={sig_b64}&se={expiry}&skn={key_name}"


class IMDSHandler(BaseHTTPRequestHandler):
    """Handles IMDS-style requests and proxies to Azure Relay."""

    def log_message(self, fmt, *args):
        print(f"[imds-router] {fmt % args}", flush=True)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/healthz":
            self._json_response(200, {"Healthy": True})
            return

        if parsed.path in ("/metadata/identity/oauth2/token", "/token"):
            self._handle_token_request(parsed)
            return

        if parsed.path.startswith("/metadata/instance"):
            self._handle_metadata_request(parsed)
            return

        self._json_response(404, {"error": "Not found"})

    def _handle_token_request(self, parsed):
        qs = urllib.parse.parse_qs(parsed.query)
        resource = qs.get("resource", ["https://management.azure.com/"])[0]

        if not RELAY_URL or not RELAY_SENDER_KEY:
            self._json_response(500, {"error": "IMDS_RELAY_URL or IMDS_RELAY_SENDER_KEY not configured"})
            return

        try:
            relay_uri = f"{RELAY_URL}?resource={urllib.parse.quote_plus(resource)}"
            sas_token = _generate_sas_token(RELAY_URL, RELAY_SENDER_KEY)

            req = urllib.request.Request(relay_uri, headers={
                "Authorization": sas_token,
                "Content-Type": "application/json",
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode())

            self._json_response(200, {
                "access_token": body.get("access_token", ""),
                "expires_on": str(body.get("expires_on", "")),
                "resource": resource,
                "token_type": "Bearer",
            })
        except Exception as e:
            self.log_message("Relay error: %s", e)
            self._json_response(500, {"error": str(e)})

    def _handle_metadata_request(self, parsed):
        """Return a synthetic instance metadata response for validation."""
        self._json_response(200, {
            "compute": {
                "subscriptionId": os.environ.get("IMDS_SUBSCRIPTION_ID", "00000000-0000-0000-0000-000000000000"),
                "resourceGroupName": "github-actions",
                "name": "github-runner",
            }
        })

    def _json_response(self, status: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    if not RELAY_URL:
        print("[imds-router] WARNING: IMDS_RELAY_URL not set — token requests will fail", flush=True)

    server = HTTPServer(("0.0.0.0", LISTEN_PORT), IMDSHandler)
    print(f"[imds-router] Listening on 0.0.0.0:{LISTEN_PORT}", flush=True)
    print(f"[imds-router] Relay configured: {'yes' if RELAY_URL else 'no'}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[imds-router] Shutting down", flush=True)
        server.shutdown()


if __name__ == "__main__":
    main()
