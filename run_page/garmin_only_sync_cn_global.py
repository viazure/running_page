"""Sync Garmin CN activities to Garmin Global (FIT only).

Unlike the daily site sync, this script must still upload when FIT files
already exist in the shared Actions cache. It tracks CN activity IDs that
were successfully pushed to Global in FIT_OUT/.synced_to_global.json.
"""

import argparse
import asyncio
import json
import os
import sys
from io import BytesIO

from config import FIT_FOLDER
from garmin_sync import Garmin, download_new_activities, get_downloaded_ids

# Dotfile under FIT_OUT: shared track_data cache keeps it, and
# get_downloaded_ids() ignores names starting with ".".
SYNCED_TO_GLOBAL_FILE = os.path.join(FIT_FOLDER, ".synced_to_global.json")


def load_synced_to_global_ids():
    if not os.path.exists(SYNCED_TO_GLOBAL_FILE):
        return set()
    try:
        with open(SYNCED_TO_GLOBAL_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return {str(i) for i in data}
    except Exception as e:  # noqa: BLE001
        print(f"Failed to load {SYNCED_TO_GLOBAL_FILE}: {e}")
    return set()


def save_synced_to_global_ids(ids):
    os.makedirs(FIT_FOLDER, exist_ok=True)
    with open(SYNCED_TO_GLOBAL_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted(str(i) for i in ids), f, indent=2)
        f.write("\n")


async def upload_fit_file(client, path):
    """Upload one FIT file; return True on success-looking response."""
    print(f"Uploading {path}")
    with open(path, "rb") as f:  # noqa: ASYNC230
        file_body = BytesIO(f.read())
    files = {"file": (os.path.basename(path), file_body)}
    try:
        res = await client.req.post(
            client.upload_url, files=files, headers=client.headers
        )
    except Exception as e:  # noqa: BLE001
        print(f"garmin upload request failed: {e}")
        return False
    try:
        resp = res.json().get("detailedImportResult")
        print("garmin upload success: ", resp)
        return True
    except Exception as e:  # noqa: BLE001
        # Duplicate / already-imported responses often lack detailedImportResult.
        print(f"garmin upload response: status={res.status_code} body={res.text[:300]} ({e})")
        return 200 <= res.status_code < 300


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "cn_secret_string", nargs="?", help="secret_string fro get_garmin_secret.py"
    )
    parser.add_argument(
        "global_secret_string", nargs="?", help="secret_string fro get_garmin_secret.py"
    )
    parser.add_argument(
        "--only-run",
        dest="only_run",
        action="store_true",
        help="if is only for running",
    )

    options = parser.parse_args()
    secret_string_cn = options.cn_secret_string
    secret_string_global = options.global_secret_string
    auth_domain = "CN"
    is_only_running = options.only_run
    if secret_string_cn is None or secret_string_global is None:
        print("Missing argument nor valid configuration file")
        sys.exit(1)

    os.makedirs(FIT_FOLDER, exist_ok=True)

    # Only treat existing FIT as downloaded. Do not merge GPX IDs — Garmin CN
    # GPX often has summary fields but no track points; counting them as done
    # would skip FIT download (same fix as garmin_sync.py --fit).
    downloaded_fit = [i for i in get_downloaded_ids(FIT_FOLDER) if i.isdigit()]
    synced_to_global = load_synced_to_global_ids()
    print(
        f"Local FIT: {len(downloaded_fit)}; already synced to Global: {len(synced_to_global)}"
    )

    loop = asyncio.get_event_loop()
    future = asyncio.ensure_future(
        download_new_activities(
            secret_string_cn,
            auth_domain,
            downloaded_fit,
            is_only_running,
            FIT_FOLDER,
            "fit",
        )
    )
    loop.run_until_complete(future)
    new_ids, _id2title = future.result()
    print(f"Newly downloaded from CN: {len(new_ids)}")

    local_fit_ids = [
        i for i in get_downloaded_ids(FIT_FOLDER) if i.isdigit()
    ]
    pending_ids = sorted(set(local_fit_ids) - synced_to_global)
    to_upload_files = [
        os.path.join(FIT_FOLDER, f"{i}.fit")
        for i in pending_ids
        if os.path.exists(os.path.join(FIT_FOLDER, f"{i}.fit"))
    ]

    print(f"Pending upload to Global: {len(to_upload_files)}")
    if to_upload_files:
        print("Files to sync: " + " ".join(to_upload_files))
    else:
        print("Files to sync: (none)")

    if not to_upload_files:
        sys.exit(0)

    garmin_global_client = Garmin(
        secret_string_global,
        "COM",
        is_only_running,
    )

    async def upload_pending():
        uploaded = []
        for path in to_upload_files:
            activity_id = os.path.splitext(os.path.basename(path))[0]
            ok = await upload_fit_file(garmin_global_client, path)
            if ok:
                uploaded.append(activity_id)
            else:
                print(f"Skip marking {activity_id} as synced (upload not confirmed)")
        await garmin_global_client.req.aclose()
        return uploaded

    uploaded_ids = loop.run_until_complete(upload_pending())
    if uploaded_ids:
        synced_to_global.update(uploaded_ids)
        save_synced_to_global_ids(synced_to_global)
        print(
            f"Marked {len(uploaded_ids)} activities as synced to Global "
            f"(tracker: {SYNCED_TO_GLOBAL_FILE})"
        )
