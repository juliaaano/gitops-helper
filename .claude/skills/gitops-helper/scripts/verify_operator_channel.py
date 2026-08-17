#!/usr/bin/env python3
"""Verify a redhat-operators channel against quay.io/rhpds/olm_snapshot_redhat_catalog.
Scope rationale: gitops-patterns.md, "Verifying and Pinning Operator Channels".

Usage:
  verify_operator_channel.py list-versions [--top N]
  verify_operator_channel.py verify --ocp-version X.Y --package NAME [--channel NAME]

Prints one JSON object to stdout. Exit 0: check "error". Exit 2 (treat channel as
unverified): error is podman_unavailable, quay_unreachable, invalid_ocp_version,
no_snapshot_for_version, extraction_failed, or malformed_catalog_data.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

CATALOG_REPO = "olm_snapshot_redhat_catalog"  # only catalog AgnosticD actually pins to
CACHE_DIR = "/tmp/rhdp-catalog-cache"
TAGS_CACHE_TTL_SECONDS = 3600  # snapshots publish weekly; an hour is safely fresh


def fetch_tags(repo):
    """Tags for a snapshot repo, cached briefly so verifying many operators against
    the same OCP version doesn't re-hit quay.io each time."""
    cache_file = os.path.join(CACHE_DIR, f"{repo}-tags.json")
    try:
        if time.time() - os.path.getmtime(cache_file) < TAGS_CACHE_TTL_SECONDS:
            with open(cache_file) as f:
                return json.load(f)
    except (OSError, ValueError):
        pass  # fall through to a live fetch

    url = f"https://quay.io/api/v1/repository/rhpds/{repo}?includeTags=true"
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.load(resp)
    tags = list(data["tags"].keys())

    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(cache_file, "w") as f:
            json.dump(tags, f)
    except OSError:
        pass  # best-effort cache

    return tags


def versions_from_tags(tags):
    versions = set()
    for t in tags:
        if not t.startswith("v") or "_" not in t:
            continue
        major_minor = t[1:].split("_", 1)[0]
        parts = major_minor.split(".")
        if len(parts) != 2 or not all(p.isdigit() for p in parts):
            continue
        versions.add((int(parts[0]), int(parts[1])))
    return sorted(versions, reverse=True)


def latest_tag_for_version(tags, major, minor):
    prefix = f"v{major}.{minor}_"
    matching = sorted(t for t in tags if t.startswith(prefix))
    return matching[-1] if matching else None


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def podman_available():
    return run(["podman", "--version"]).returncode == 0


def ensure_extracted(repo, tag, package):
    """Pull the snapshot (if not cached) and extract /configs/<package>. Extracts to a
    temp dir and renames into place on success, so a killed run can't leave a partial
    directory that a later call would mistake for a complete cache hit."""
    dest = os.path.join(CACHE_DIR, repo, tag, package)
    if os.path.isdir(dest):
        return dest

    image = f"quay.io/rhpds/{repo}:{tag}"
    pull = run(["podman", "pull", image])
    if pull.returncode != 0:
        raise RuntimeError(f"podman pull failed for {image}: {pull.stderr.strip()}")

    create = run(["podman", "create", "--entrypoint", '["true"]', image])
    if create.returncode != 0:
        raise RuntimeError(f"podman create failed: {create.stderr.strip()}")
    cid = create.stdout.strip()

    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp_dest = f"{dest}.tmp-{os.getpid()}"
    shutil.rmtree(tmp_dest, ignore_errors=True)
    try:
        cp = run(["podman", "cp", f"{cid}:/configs/{package}", tmp_dest])
        if cp.returncode != 0:
            stderr = cp.stderr.lower()
            if "no such file or directory" in stderr or "does not exist" in stderr:
                return None  # package genuinely isn't in this catalog
            raise RuntimeError(f"podman cp failed: {cp.stderr.strip()}")
        os.rename(tmp_dest, dest)
    finally:
        run(["podman", "rm", cid])
        shutil.rmtree(tmp_dest, ignore_errors=True)
    return dest if os.path.isdir(dest) else None


def parse_catalog_configs(path):
    """Parse concatenated-JSON FBC config files under path. Walks recursively --
    some FBC layouts split a package's config across nested subdirectories."""
    files = [
        os.path.join(dirpath, f)
        for dirpath, _, filenames in os.walk(path)
        for f in filenames
    ]
    decoder = json.JSONDecoder()
    objs = []
    for fp in files:
        with open(fp) as f:
            content = f.read().strip()
        idx = 0
        while idx < len(content):
            obj, end = decoder.raw_decode(content, idx)
            objs.append(obj)
            idx = end
            while idx < len(content) and content[idx] in " \n\t\r":
                idx += 1
    channels = sorted(o["name"] for o in objs if o.get("schema") == "olm.channel")
    default_channel = next(
        (o.get("defaultChannel") for o in objs if o.get("schema") == "olm.package"), None
    )
    return channels, default_channel


def cmd_list_versions(args):
    try:
        tags = fetch_tags(CATALOG_REPO)
    except Exception as e:
        print(json.dumps({"error": "quay_unreachable", "detail": str(e)}))
        sys.exit(2)
    versions = versions_from_tags(tags)[: args.top]
    print(json.dumps([f"{major}.{minor}" for major, minor in versions]))


def cmd_verify(args):
    repo = CATALOG_REPO

    if not podman_available():
        print(json.dumps({"error": "podman_unavailable"}))
        sys.exit(2)

    try:
        tags = fetch_tags(repo)
    except Exception as e:
        print(json.dumps({"error": "quay_unreachable", "detail": str(e)}))
        sys.exit(2)

    parts = args.ocp_version.split(".")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        print(json.dumps({"error": "invalid_ocp_version", "ocp_version": args.ocp_version}))
        sys.exit(2)
    major, minor = parts
    tag = latest_tag_for_version(tags, int(major), int(minor))
    if not tag:
        print(json.dumps({"error": "no_snapshot_for_version", "ocp_version": args.ocp_version}))
        sys.exit(2)

    try:
        path = ensure_extracted(repo, tag, args.package)
    except RuntimeError as e:
        print(json.dumps({"error": "extraction_failed", "detail": str(e)}))
        sys.exit(2)

    catalog_image = f"quay.io/rhpds/{repo}:{tag}"

    if path is None:
        print(json.dumps({
            "error": None,
            "package_found": False,
            "catalog_image": catalog_image,
            "tag": tag,
        }))
        return

    try:
        channels, default_channel = parse_catalog_configs(path)
    except (ValueError, KeyError) as e:
        shutil.rmtree(path, ignore_errors=True)  # discard corrupted cache entry
        print(json.dumps({"error": "malformed_catalog_data", "detail": str(e)}))
        sys.exit(2)

    requested = args.channel
    verified = requested in channels if requested else None
    result = {
        "error": None,
        "package_found": True,
        "catalog_image": catalog_image,
        "tag": tag,
        "channels": channels,
        "default_channel": default_channel,
        "requested_channel": requested,
        "verified": verified,
        "resolved_channel": requested if verified else default_channel,
    }
    print(json.dumps(result, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    lv = sub.add_parser("list-versions", help="List the N newest OCP versions with a published snapshot")
    lv.add_argument("--top", type=int, default=3)
    lv.set_defaults(func=cmd_list_versions)

    v = sub.add_parser(
        "verify",
        help="Resolve a redhat-operators package's real channels for a given OCP version",
    )
    v.add_argument("--ocp-version", required=True, help="Major.minor, e.g. 4.22")
    v.add_argument("--package", required=True, help="OLM package name, e.g. openshift-pipelines-operator-rh")
    v.add_argument("--channel", default=None, help="Channel to verify; omit to just report available channels")
    v.set_defaults(func=cmd_verify)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
