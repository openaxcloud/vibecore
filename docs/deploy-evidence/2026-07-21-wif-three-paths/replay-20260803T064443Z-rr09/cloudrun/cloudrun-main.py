import os, urllib.request, json
from http.server import BaseHTTPRequestHandler, HTTPServer
BUCKET = os.environ["BUCKET"]
MD = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default"
def md(path):
    r = urllib.request.Request(MD+path, headers={"Metadata-Flavor":"Google"})
    return urllib.request.urlopen(r, timeout=5).read().decode()
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            sa = md("/email")                       # which identity, from metadata
            tok = json.loads(md("/token"))["access_token"]   # token WITHOUT any key file
            url = f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/secret.txt?alt=media"
            req = urllib.request.Request(url, headers={"Authorization":"Bearer "+tok})
            try:
                body = urllib.request.urlopen(req, timeout=8).read().decode()
                out = {"identity": sa, "keyUsed": False, "read_status": 200, "secret": body.strip()}
            except urllib.error.HTTPError as e:
                out = {"identity": sa, "keyUsed": False, "read_status": e.code, "denied": e.read().decode()[:200]}
        except Exception as e:
            out = {"error": str(e)}
        self.send_response(200); self.send_header("Content-Type","application/json"); self.end_headers()
        self.wfile.write(json.dumps(out).encode())
HTTPServer(("0.0.0.0", int(os.environ.get("PORT","8080"))), H).serve_forever()
