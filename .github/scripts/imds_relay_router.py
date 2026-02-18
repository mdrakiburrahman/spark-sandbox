#!/usr/bin/env python3
"""IMDS Relay Router — proxies az login --identity token requests to Azure Relay."""

import base64, hashlib, hmac, json, os, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

LISTEN_PORT = int(os.environ.get("IMDS_ROUTER_PORT", "8080"))
RELAY_URL = os.environ.get("IMDS_RELAY_URL", "")
RELAY_SENDER_KEY = os.environ.get("IMDS_RELAY_SENDER_KEY", "")
RELAY_KEY_NAME = os.environ.get("IMDS_RELAY_KEY_NAME", "Send")
IDENTITY_HEADER_VALUE = os.environ.get("IDENTITY_HEADER", "local-dev-secret")


def _relay_sas_uri(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.rstrip("/").removesuffix("/token")
    return f"http://{parsed.hostname}{path}"


def _generate_sas_token(uri: str, key: str, key_name: str, expiry_seconds: int = 3600) -> str:
    expiry = int(time.time()) + expiry_seconds
    sts = f"{urllib.parse.quote(uri, safe='')}\n{expiry}"
    sig = hmac.new(key.encode(), sts.encode(), hashlib.sha256).digest()
    sig_b64 = urllib.parse.quote(base64.b64encode(sig).decode(), safe="")
    return f"SharedAccessSignature sr={urllib.parse.quote(uri, safe='')}&sig={sig_b64}&se={expiry}&skn={key_name}"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[imds-router] {fmt % args}", flush=True)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/healthz":
            return self._json(200, {"Healthy": True})
        if parsed.path in ("/metadata/identity/oauth2/token", "/token"):
            return self._handle_token(parsed)
        if parsed.path.startswith("/metadata/instance"):
            return self._json(200, {"compute": {"subscriptionId": os.environ.get("IMDS_SUBSCRIPTION_ID", "00000000-0000-0000-0000-000000000000"), "resourceGroupName": "github-actions", "name": "github-runner"}})
        self._json(404, {"error": "Not found"})

    def _handle_token(self, parsed):
        if self.headers.get("X-IDENTITY-HEADER", "") != IDENTITY_HEADER_VALUE:
            return self._json(403, {"error": "Invalid X-IDENTITY-HEADER"})

        qs = urllib.parse.parse_qs(parsed.query)
        resource = qs.get("resource", ["https://management.azure.com/"])[0]

        if not RELAY_URL or not RELAY_SENDER_KEY:
            return self._json(500, {"error": "IMDS_RELAY_URL or IMDS_RELAY_SENDER_KEY not set"})

        try:
            relay_uri = f"{RELAY_URL}?resource={urllib.parse.quote_plus(resource)}"
            client_id = qs.get("client_id", [None])[0]
            if client_id:
                relay_uri += f"&client_id={urllib.parse.quote_plus(client_id)}"

            sas = _generate_sas_token(_relay_sas_uri(RELAY_URL), RELAY_SENDER_KEY, RELAY_KEY_NAME)
            req = urllib.request.Request(relay_uri, headers={"ServiceBusAuthorization": sas})
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode())

            self._json(200, {"access_token": body.get("access_token", ""), "expires_on": str(body.get("expires_on", "")), "resource": resource, "token_type": "Bearer"})
        except urllib.error.HTTPError as e:
            detail = e.read().decode() if e.fp else ""
            self.log_message("Relay error %s: %s", e.code, detail[:200])
            self._json(502, {"error": f"Relay {e.code}", "detail": detail[:500]})
        except Exception as e:
            self.log_message("Error: %s", e)
            self._json(500, {"error": str(e)})

    def _json(self, status: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    print(f"[imds-router] Listening on 0.0.0.0:{LISTEN_PORT}", flush=True)
    server.serve_forever()
