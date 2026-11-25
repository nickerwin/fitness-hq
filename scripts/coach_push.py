#!/usr/bin/env python3
"""Send a lock-screen notification to every device where Nick turned on notifications in Fitness HQ.

  python3 scripts/coach_push.py --title "Coach: Lower A" --body "Good start. Squat reset to 185 × 5." [--url "#/"]

This is Web Push (RFC 8030, encrypted per RFC 8291, signed with VAPID per RFC 8292). It needs only the
`cryptography` package. The VAPID key pair lives in /mnt/project-files/coach/vapid.json ({"public", "private"},
base64url). The public half is also built into the app (src/lib/push.ts). Subscriptions are read with the coach key,
and ones the push service reports as gone (404/410) are removed.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from coach_pull import load_creds  # noqa: E402

APP_URL = "https://nickerwin.github.io/fitness-hq/"


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def unb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hkdf(salt: bytes, ikm: bytes, info: bytes, length: int) -> bytes:
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    return hmac.new(prk, info + b"\x01", hashlib.sha256).digest()[:length]


def encrypt(payload: bytes, p256dh: str, auth: str) -> bytes:
    """aes128gcm content encoding for Web Push (RFC 8291 + RFC 8188), single record."""
    ua_pub = unb64u(p256dh)
    auth_secret = unb64u(auth)
    as_key = ec.generate_private_key(ec.SECP256R1())
    as_pub = as_key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = as_key.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub))
    ikm = hkdf(auth_secret, shared, b"WebPush: info\x00" + ua_pub + as_pub, 32)
    salt = os.urandom(16)
    cek = hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    ct = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)
    return salt + struct.pack("!I", 4096) + bytes([len(as_pub)]) + as_pub + ct


def vapid_header(endpoint: str, vapid: dict) -> str:
    u = urllib.parse.urlparse(endpoint)
    aud = f"{u.scheme}://{u.netloc}"
    header = b64u(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    claims = b64u(json.dumps({"aud": aud, "exp": int(time.time()) + 12 * 3600, "sub": APP_URL}, separators=(",", ":")).encode())
    key = ec.derive_private_key(int.from_bytes(unb64u(vapid["private"]), "big"), ec.SECP256R1())
    r, s = decode_dss_signature(key.sign(f"{header}.{claims}".encode(), ec.ECDSA(hashes.SHA256())))
    sig = b64u(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    return f"vapid t={header}.{claims}.{sig}, k={vapid['public']}"


def rpc(url, key, fn, body):
    req = urllib.request.Request(f"{url}/rest/v1/rpc/{fn}", data=json.dumps(body).encode(), headers={"apikey": key, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def send(sub: dict, payload: bytes, vapid: dict) -> int:
    req = urllib.request.Request(
        sub["endpoint"],
        data=encrypt(payload, sub["p256dh"], sub["auth"]),
        headers={
            "Authorization": vapid_header(sub["endpoint"], vapid),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "TTL": "86400",
            "Urgency": "normal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"  push service said {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
        return e.code


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--creds", default="/mnt/project-files/coach/access.json")
    ap.add_argument("--vapid", default="/mnt/project-files/coach/vapid.json")
    ap.add_argument("--title", required=True)
    ap.add_argument("--body", required=True)
    ap.add_argument("--url", default="#/", help="where tapping the notification opens, e.g. #/workout/12 or #/")
    a = ap.parse_args()
    url, key, tok = load_creds(a.creds if os.path.exists(a.creds) else None)
    with open(a.vapid) as f:
        vapid = json.load(f)
    subs = rpc(url, key, "fhq_coach_push_subs", {"token": tok})
    if not subs:
        print("No devices have notifications turned on (Settings → Notifications in the app).")
        return
    payload = json.dumps({"title": a.title, "body": a.body[:400], "url": a.url}).encode()
    for s in subs:
        status = send(s, payload, vapid)
        host = urllib.parse.urlparse(s["endpoint"]).netloc
        print(f"{host}: {status}")
        if status in (404, 410):
            rpc(url, key, "fhq_coach_drop_push", {"token": tok, "endpoint": s["endpoint"]})
            print("  removed expired subscription")


if __name__ == "__main__":
    main()
