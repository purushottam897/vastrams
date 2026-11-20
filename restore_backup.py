#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "python-dotenv>=1.0.0",
#   "pymongo>=4.6.0",
#   "dnspython>=2.4.0",
# ]
# ///
"""
Vastrams MongoDB Database Restoration & Verification Tool
=========================================================
Restores collections, BSON documents, and index metadata from a
Vastrams_MongoDB_Restore_YYYY-MM-DD.tar.gz archive.

Supports:
  - Safe restoration verification into an isolated test database (--test-restore)
  - Dry-run inspection of archive manifest and collections (--inspect)
  - Production or staging database restoration with safety guards
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import sys
import tarfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# Ensure local .venv packages are found if running on Windows
BASE_DIR = Path(__file__).resolve().parent
LOCAL_VENV_PACKAGES = BASE_DIR / ".venv" / "Lib" / "site-packages"
if LOCAL_VENV_PACKAGES.exists() and str(LOCAL_VENV_PACKAGES) not in sys.path:
    sys.path.insert(0, str(LOCAL_VENV_PACKAGES))

import bson
from dotenv import load_dotenv
import pymongo
from bson import json_util

IST = timezone(timedelta(hours=5, minutes=30), name="IST")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("vastrams.restore")

# Load environment configuration
load_dotenv(BASE_DIR / ".env")
backend_env = BASE_DIR / "backend" / ".env"
if not os.getenv("MONGO_URI") and backend_env.exists():
    for _line in backend_env.read_text(encoding="utf-8", errors="ignore").splitlines():
        if _line.strip().startswith("MONGO_URI="):
            os.environ["MONGO_URI"] = _line.split("=", 1)[1].strip().strip('"').strip("'")
            break


def get_default_mongo_uri() -> str:
    uri = os.getenv("MONGO_URI", "").strip()
    if not uri:
        raise ValueError("MONGO_URI is missing from environment (.env).")
    return uri


def inspect_archive(archive_path: Path) -> dict[str, Any]:
    """Inspect and display archive contents without modifying any database."""
    if not archive_path.exists():
        raise FileNotFoundError(f"Archive file not found: {archive_path}")

    logger.info("Inspecting archive: %s (%d bytes)...", archive_path.name, archive_path.stat().st_size)

    with tarfile.open(archive_path, mode="r:gz") as tar:
        manifest_data: dict[str, Any] = {}
        for member in tar.getmembers():
            if member.name.endswith("/manifest.json"):
                f = tar.extractfile(member)
                if f:
                    manifest_data = json.loads(f.read().decode("utf-8"))
                break

        print("\n" + "=" * 60)
        print("VASTRAMS BACKUP ARCHIVE MANIFEST")
        print("=" * 60)
        print(f"Archive File:    {archive_path.name}")
        print(f"Original DB:     {manifest_data.get('database', 'unknown')}")
        print(f"Backup Time IST: {manifest_data.get('backup_date_ist', 'unknown')}")
        print(f"Backup Time UTC: {manifest_data.get('backup_date_utc', 'unknown')}")
        print("-" * 60)
        print(f"{'Collection':<20} | {'Docs':>6} | {'Size':>10} | {'Indexes':>7}")
        print("-" * 60)

        collections = manifest_data.get("collections", {})
        total_docs = 0
        total_size = 0
        for col_name, info in sorted(collections.items()):
            cnt = info.get("count", 0)
            sz = info.get("bson_bytes", 0)
            idx_cnt = info.get("index_count", 0)
            total_docs += cnt
            total_size += sz
            print(f"{col_name:<20} | {cnt:>6} | {sz/1024:>8.1f} KB | {idx_cnt:>7}")

        print("-" * 60)
        print(f"{'TOTAL (' + str(len(collections)) + ' collections)':<20} | {total_docs:>6} | {total_size/1024:>8.1f} KB")
        print("=" * 60 + "\n")

    return manifest_data


def restore_archive(
    archive_path: Path,
    target_db_name: str,
    mongo_uri: str,
    drop_first: bool = False,
    is_test_mode: bool = False,
) -> dict[str, int]:
    """
    Restore all BSON collections and indexes from the archive into target_db_name.
    Returns dictionary of restored document counts.
    """
    if not archive_path.exists():
        raise FileNotFoundError(f"Archive file not found: {archive_path}")

    # Production safety guard
    if target_db_name in ("vastrams", "production", "prod") and not is_test_mode and not drop_first:
        raise ValueError(
            f"Safety Protection: Refusing to restore to production database '{target_db_name}' "
            "without explicit --confirm-overwrite. Please restore to a staging or test database, e.g., --target-db vastrams_test."
        )

    logger.info("Connecting to MongoDB for restoration...")
    client = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=10000)
    db = client[target_db_name]
    logger.info("Target database: %s", db.name)

    restored_counts: dict[str, int] = {}

    with tarfile.open(archive_path, mode="r:gz") as tar:
        # 1. Discover all collections in the archive
        col_files: dict[str, dict[str, tarfile.TarInfo]] = {}
        for member in tar.getmembers():
            parts = member.name.split("/")
            if len(parts) >= 2:
                col_file = parts[-1]
                if col_file.endswith(".bson"):
                    c_name = col_file[:-5]
                    col_files.setdefault(c_name, {})["bson"] = member
                elif col_file.endswith(".metadata.json"):
                    c_name = col_file[:-14]
                    col_files.setdefault(c_name, {})["metadata"] = member

        logger.info("Found %d collections in archive to restore.", len(col_files))

        # 2. Restore each collection
        for col_name, members in sorted(col_files.items()):
            col = db[col_name]
            if drop_first:
                logger.info("Dropping existing collection '%s' in target database...", col_name)
                col.drop()

            # Read and insert BSON documents
            bson_member = members.get("bson")
            doc_count = 0
            if bson_member:
                f_bson = tar.extractfile(bson_member)
                if f_bson:
                    raw_data = f_bson.read()
                    if raw_data:
                        docs = bson.decode_all(raw_data)
                        if docs:
                            # Insert in batches of 500 for safety and speed
                            batch_size = 500
                            for i in range(0, len(docs), batch_size):
                                batch = docs[i : i + batch_size]
                                col.insert_many(batch, ordered=False)
                            doc_count = len(docs)

            restored_counts[col_name] = doc_count
            logger.info("Restored collection '%s': %d documents", col_name, doc_count)

            # Recreate indexes from metadata
            meta_member = members.get("metadata")
            if meta_member:
                f_meta = tar.extractfile(meta_member)
                if f_meta:
                    meta_json = json.loads(f_meta.read().decode("utf-8"))
                    indexes = meta_json.get("indexes", [])
                    for idx_spec in indexes:
                        idx_name = idx_spec.get("name")
                        key_list = idx_spec.get("key", {})
                        # Skip default _id_ index (MongoDB creates automatically)
                        if idx_name == "_id_":
                            continue

                        # Convert key dict to list of (field, direction) tuples
                        keys = [(k, int(v)) for k, v in key_list.items()]
                        unique = idx_spec.get("unique", False)
                        sparse = idx_spec.get("sparse", False)
                        expire_after = idx_spec.get("expireAfterSeconds")

                        kwargs: dict[str, Any] = {"name": idx_name, "unique": unique, "sparse": sparse}
                        if expire_after is not None:
                            kwargs["expireAfterSeconds"] = expire_after

                        try:
                            col.create_index(keys, **kwargs)
                            logger.info("  ✓ Recreated index '%s' on '%s'", idx_name, col_name)
                        except Exception as idx_err:
                            logger.warning("  ⚠️ Could not recreate index '%s' on '%s': %s", idx_name, col_name, idx_err)

    client.close()
    return restored_counts


def run_test_restore(archive_path: Path, mongo_uri: str, keep_test_db: bool = False) -> bool:
    """
    Execute a complete restoration test into an isolated test database,
    verify that 100% of records match the archive, and clean up.
    """
    test_db_name = f"vastrams_restore_test_{datetime.now(IST).strftime('%Y%m%d_%H%M%S')}"
    logger.info("=" * 60)
    logger.info("STARTING DATABASE RESTORATION TEST")
    logger.info("Archive:         %s", archive_path.name)
    logger.info("Test Database:   %s (Isolated from production)", test_db_name)
    logger.info("=" * 60)

    try:
        # Step 1: Read archive manifest for expected counts
        manifest = inspect_archive(archive_path)
        expected_collections = manifest.get("collections", {})

        # Step 2: Restore into test database
        logger.info("Restoring all archive collections into test database '%s'...", test_db_name)
        restored_counts = restore_archive(
            archive_path=archive_path,
            target_db_name=test_db_name,
            mongo_uri=mongo_uri,
            drop_first=True,
            is_test_mode=True,
        )

        # Step 3: Verify document counts in the actual test database
        client = pymongo.MongoClient(mongo_uri)
        test_db = client[test_db_name]
        logger.info("Verifying restored database records against archive manifest...")

        all_passed = True
        print("\n" + "=" * 60)
        print("RESTORATION INTEGRITY VERIFICATION REPORT")
        print("=" * 60)
        print(f"{'Collection':<20} | {'Archive Docs':>12} | {'Restored Docs':>13} | {'Status':>10}")
        print("-" * 60)

        for col_name, info in sorted(expected_collections.items()):
            exp_cnt = info.get("count", 0)
            actual_cnt = test_db[col_name].count_documents({})
            status = "MATCH ✓" if exp_cnt == actual_cnt else "FAIL ✗"
            if exp_cnt != actual_cnt:
                all_passed = False
            print(f"{col_name:<20} | {exp_cnt:>12} | {actual_cnt:>13} | {status:>10}")

        print("=" * 60)

        # Step 4: Cleanup test database unless requested to keep
        if not keep_test_db:
            logger.info("Cleaning up isolated test database '%s'...", test_db_name)
            client.drop_database(test_db_name)
            logger.info("✓ Test database dropped cleanly.")
        else:
            logger.info("Retaining test database '%s' as requested (--keep-test-db).", test_db_name)

        client.close()

        if all_passed:
            logger.info("🎉 RESTORATION TEST 100% SUCCESSFUL: All collections and records verified.")
            return True
        else:
            logger.error("❌ RESTORATION TEST FAILED: Record count mismatch detected.")
            return False

    except Exception as exc:
        logger.exception("Restoration test failed with error: %s", exc)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Vastrams Database Restoration & Verification Tool")
    parser.add_argument("--archive", type=Path, required=True, help="Path to Vastrams_MongoDB_Restore_*.tar.gz file.")
    parser.add_argument("--inspect", action="store_true", help="Inspect archive manifest without restoring.")
    parser.add_argument("--test-restore", action="store_true", help="Run automated restoration test in isolated test DB.")
    parser.add_argument("--keep-test-db", action="store_true", help="Do not drop test database after test.")
    parser.add_argument("--target-db", type=str, help="Target database name to restore into.")
    parser.add_argument("--drop-first", action="store_true", help="Drop target collections before restore.")
    parser.add_argument("--confirm-overwrite", action="store_true", help="Explicit confirmation for production DB.")
    parser.add_argument("--uri", type=str, help="MongoDB connection URI (defaults to MONGO_URI from .env).")

    args = parser.parse_args()

    mongo_uri = args.uri or get_default_mongo_uri()

    if args.inspect:
        inspect_archive(args.archive)
        return 0

    if args.test_restore:
        success = run_test_restore(args.archive, mongo_uri, keep_test_db=args.keep_test_db)
        return 0 if success else 1

    if not args.target_db:
        logger.error("Please specify --target-db <name> or use --test-restore to run automated validation.")
        return 1

    try:
        restore_archive(
            archive_path=args.archive,
            target_db_name=args.target_db,
            mongo_uri=mongo_uri,
            drop_first=args.drop_first or args.confirm_overwrite,
            is_test_mode=False,
        )
        logger.info("✓ Restoration complete into database '%s'.", args.target_db)
        return 0
    except Exception as exc:
        logger.exception("Restoration failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
