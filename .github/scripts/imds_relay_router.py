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
RELAY_KEY_NAME = os.environ.get("IMDS_RELAY_KEY_NAME", "Send")
IDENTITY_HEADER_VALUE = os.environ.get("IDENTITY_HEADER", "local-dev-secret")


def _relay_sas_uri(url: str) -> str:
    """Derive the SAS resource URI: strip /token suffix and force http:// scheme."""
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.rstrip("/")
    if path.endswith("/token"):
        path = path[: -len("/token")]
    return f"http://{parsed.hostname}{path}"


def _generate_sas_token(uri: str, key: str, key_name: str = "Send", expiry_seconds: int = 3600) -> str:
    """Generate a SharedAccessSignature token for Azure Relay Hybrid Connections.

    Matches the hyco-https Node.js SDK behaviour:
      - SAS resource URI uses http:// scheme
      - HMAC key is the raw SAS key string (NOT base64-decoded)
    """
    expiry = int(time.time()) + expiry_seconds
    string_to_sign = f"{urllib.parse.quote(uri, safe='')}\n{expiry}"
    sig = hmac.new(key.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha256).digest()
    sig_b64 = urllib.parse.quote(base64.b64encode(sig).decode("utf-8"), safe="")
    return f"SharedAccessSignature sr={urllib.parse.quote(uri, safe='')}&sig={sig_b64}&se={expiry}&skn={key_name}"


class IMDSHandler(BaseHTTPRequestHandler):
    """Handles IMDS-style requests and proxies to Azure Relay."""

    def log_message(self, fmt, *args):
        print(f"[imds-router] {fmt % args}", flush=True)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        self.log_message("GET %s  headers=%s", self.path,
                         {k: v for k, v in self.headers.items()})

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
        # App Service MSI protocol: validate X-IDENTITY-HEADER
        incoming_header = self.headers.get("X-IDENTITY-HEADER", "")
        if incoming_header != IDENTITY_HEADER_VALUE:
            self.log_message("X-IDENTITY-HEADER mismatch: got '%s', expected '%s'",
                             incoming_header, IDENTITY_HEADER_VALUE)
            self._json_response(403, {"error": "Invalid or missing X-IDENTITY-HEADER"})
            return

        qs = urllib.parse.parse_qs(parsed.query)
        resource = qs.get("resource", ["https://management.azure.com/"])[0]
        client_id = qs.get("client_id", [None])[0]
        self.log_message("Token request: resource=%s client_id=%s", resource, client_id)

        if not RELAY_URL or not RELAY_SENDER_KEY:
            self._json_response(500, {"error": "IMDS_RELAY_URL or IMDS_RELAY_SENDER_KEY not configured"})
            return

        try:
            relay_uri = f"{RELAY_URL}?resource={urllib.parse.quote_plus(resource)}"
            if client_id:
                relay_uri += f"&client_id={urllib.parse.quote_plus(client_id)}"
            sas_uri = _relay_sas_uri(RELAY_URL)
            sas_token = _generate_sas_token(sas_uri, RELAY_SENDER_KEY, RELAY_KEY_NAME)

            self.log_message("Calling relay: %s", relay_uri)
            req = urllib.request.Request(relay_uri, headers={
                "ServiceBusAuthorization": sas_token,
                "Content-Type": "application/json",
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode()
                self.log_message("Relay response: %s", raw[:500])
                body = json.loads(raw)

            self._json_response(200, {
                "access_token": body.get("access_token", ""),
                "expires_on": str(body.get("expires_on", "")),
                "resource": resource,
                "token_type": "Bearer",
            })
        except urllib.error.HTTPError as e:
            err_body = e.read().decode() if e.fp else ""
            self.log_message("Relay HTTP error %s: %s  body=%s", e.code, e.reason, err_body[:500])
            self._json_response(502, {"error": f"Relay returned {e.code}: {e.reason}", "detail": err_body[:500]})
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
