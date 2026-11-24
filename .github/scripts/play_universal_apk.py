"""Download the universal APK that Play builds from an uploaded bundle.

Play signs it with the app signing key, the same key as store installs, so a phone
that installs this APK can later update straight from the Play Store.
Usage: play_universal_apk.py <package> <versionCode> <out.apk>; reads PLAY_SERVICE_ACCOUNT_JSON.
"""

import json
import os
import sys
import time

import google.auth.transport.requests
from google.oauth2 import service_account

package, version_code, out = sys.argv[1:4]
creds = service_account.Credentials.from_service_account_info(
    json.loads(os.environ["PLAY_SERVICE_ACCOUNT_JSON"]),
    scopes=["https://www.googleapis.com/auth/androidpublisher"],
)
session = google.auth.transport.requests.AuthorizedSession(creds)
base = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{package}/generatedApks/{version_code}"

# Play needs a few minutes after the upload to build the APKs.
download_id = None
for attempt in range(20):
    r = session.get(base)
    if r.ok:
        for apk in r.json().get("generatedApks", []):
            download_id = (apk.get("generatedUniversalApk") or {}).get("downloadId")
            if download_id:
                break
    if download_id:
        break
    print(f"Universal APK not ready yet ({r.status_code}), waiting…", flush=True)
    time.sleep(30)
if not download_id:
    sys.exit(f"Play never offered a universal APK for {package} {version_code}: {r.status_code} {r.text[:500]}")

r = session.get(f"{base}/downloads/{download_id}:download", params={"alt": "media"}, stream=True)
r.raise_for_status()
with open(out, "wb") as f:
    for chunk in r.iter_content(1 << 20):
        f.write(chunk)
print(f"Saved {out} ({os.path.getsize(out)} bytes)")
