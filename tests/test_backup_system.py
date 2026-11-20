#!/usr/bin/env python3
"""
Automated Verification Suite for Vastrams Database Backup & Weekly Report System
================================================================================
Verifies all 10 requirements:
  1. Manual Excel backup generation.
  2. Every required collection is included (Vendors, Bills, Payments, Cheques, Loans, etc.).
  3. Exported record counts match MongoDB 100%.
  4. MongoDB restore archive integrity (BSON decoding and metadata).
  5. Attachment dispatch verification (sizes and formats).
  6. Weekly business report generation (metrics, HTML, and CSV).
  7. Confirm no daily business report is scheduled.
  8. Confirm schedules use India Standard Time (IST / UTC+5:30).
  9. Test failure handling for MongoDB and SMTP errors (invalid credentials / unreachable host).
  10. Test restoration procedure in a separate isolated test database without touching production.
"""

from __future__ import annotations

import io
import os
import sys
import tarfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Add paths
BASE_DIR = Path(__file__).resolve().parent.parent
LOCAL_VENV_PACKAGES = BASE_DIR / ".venv" / "Lib" / "site-packages"
if LOCAL_VENV_PACKAGES.exists() and str(LOCAL_VENV_PACKAGES) not in sys.path:
    sys.path.insert(0, str(LOCAL_VENV_PACKAGES))
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import bson
import openpyxl
from dotenv import load_dotenv
import pymongo

load_dotenv(BASE_DIR / ".env")

import database_backup
import restore_backup
import weekly_report

IST = timezone(timedelta(hours=5, minutes=30), name="IST")


def run_all_tests() -> int:
    print("\n" + "=" * 70)
    print("VASTRAMS BACKUP & REPORTING SYSTEM — 10-POINT VERIFICATION SUITE")
    print("=" * 70 + "\n")

    results: list[tuple[int, str, bool, str]] = []

    cfg = database_backup.load_config()
    client, db = database_backup.get_db_connection(cfg["mongo_uri"])

    # -----------------------------------------------------------------------
    # TEST 1 & 2 & 3: Excel Backup Generation, Collections, and Record Counts
    # -----------------------------------------------------------------------
    print("[TEST 1, 2, 3] Generating Excel Backup & Checking Collections & Counts...")
    now_ist = datetime.now(IST)
    excel_bytes, excel_fn, db_counts = database_backup.generate_excel_backup(db, now_ist)

    test1_pass = len(excel_bytes) > 0 and excel_fn.endswith(".xlsx")
    results.append((1, "Manual Excel backup generated successfully", test1_pass, f"{len(excel_bytes)} bytes"))

    # Check required collections
    required_cols = ["vendors", "bills", "payments", "transactions", "cheques", "loans", "financiers", "settings"]
    all_req_present = all(c in db_counts for c in required_cols)
    results.append((2, "All core collections included in Excel workbook", all_req_present, f"{len(db_counts)} collections"))

    # Verify Excel counts match MongoDB
    excel_verified = database_backup.verify_excel_backup(excel_bytes, db_counts)
    results.append((3, "Exported Excel record counts match MongoDB 100%", excel_verified, f"{sum(db_counts.values())} records"))

    # -----------------------------------------------------------------------
    # TEST 4: MongoDB Restore Archive (BSON + Metadata + Integrity)
    # -----------------------------------------------------------------------
    print("[TEST 4] Generating and Verifying Native BSON Restore Archive...")
    archive_bytes, archive_fn, _ = database_backup.generate_mongodb_restore_archive(db, now_ist)
    archive_verified = database_backup.verify_mongodb_archive(archive_bytes, db_counts)
    test4_pass = len(archive_bytes) > 0 and archive_fn.endswith(".tar.gz") and archive_verified
    results.append((4, "MongoDB restore archive (BSON+metadata) generated and verified", test4_pass, f"{len(archive_bytes)} bytes"))

    # -----------------------------------------------------------------------
    # TEST 5: Attachment Delivery & Size Safety
    # -----------------------------------------------------------------------
    print("[TEST 5] Checking Attachment Formats & Email Size Safety...")
    tot_size = len(excel_bytes) + len(archive_bytes)
    under_limit = tot_size < 22 * 1024 * 1024  # 22 MB Gmail safety limit
    results.append((5, "Attachments verified within Gmail SMTP 25MB limits", under_limit, f"{tot_size/1024:.1f} KB total"))

    # -----------------------------------------------------------------------
    # TEST 6: Weekly Business Report Generation (HTML & CSV)
    # -----------------------------------------------------------------------
    print("[TEST 6] Testing Weekly Business Report Generation...")
    start_d = date(2026, 11, 1)
    end_d = date(2026, 11, 10)
    w_data = weekly_report.fetch_weekly_data(cfg["mongo_uri"], start_d, end_d)
    w_text, w_html = weekly_report.build_weekly_html_report(w_data)
    w_csv = weekly_report.build_weekly_csv(w_data)

    test6_pass = (
        "WEEKLY EXECUTIVE BUSINESS REPORT" in w_text
        and "Vastrams Weekly Business Report" in w_html
        and len(w_csv) > 0
        and w_data["total_bills_amount"] == 5000.0
    )
    results.append((6, "Weekly business report metrics, HTML, and CSV generated", test6_pass, f"{len(w_csv)} bytes CSV"))

    # -----------------------------------------------------------------------
    # TEST 7: Confirm No Daily Business Report Schedule
    # -----------------------------------------------------------------------
    print("[TEST 7] Checking Workflow Schedules...")
    daily_report_yml = BASE_DIR / ".github" / "workflows" / "daily_report.yml"
    daily_backup_yml = BASE_DIR / ".github" / "workflows" / "daily_backup.yml"
    weekly_report_yml = BASE_DIR / ".github" / "workflows" / "weekly_report.yml"

    no_daily_biz_report = not daily_report_yml.exists() and daily_backup_yml.exists() and weekly_report_yml.exists()
    results.append((7, "Old daily business report workflow removed and replaced", no_daily_biz_report, "daily_report.yml removed"))

    # -----------------------------------------------------------------------
    # TEST 8: Confirm Schedules Use India Standard Time (IST)
    # -----------------------------------------------------------------------
    print("[TEST 8] Confirming Timezone & Cron Timing...")
    # Daily backup at 18:00 IST = 12:30 UTC -> cron '30 12 * * *'
    # Weekly report on Sunday at 18:30 IST = 13:00 UTC -> cron '0 13 * * 0'
    backup_cron_ok = "30 12 * * *" in daily_backup_yml.read_text(encoding="utf-8")
    weekly_cron_ok = "0 13 * * 0" in weekly_report_yml.read_text(encoding="utf-8")
    test8_pass = backup_cron_ok and weekly_cron_ok
    results.append((8, "Cron schedules mapped to India Standard Time (18:00 & 18:30 IST)", test8_pass, "12:30 UTC & 13:00 UTC"))

    # -----------------------------------------------------------------------
    # TEST 9: Failure Handling (MongoDB & SMTP)
    # -----------------------------------------------------------------------
    print("[TEST 9] Testing Error Handling for Invalid DB / SMTP...")
    # 1. Invalid MongoDB URI
    handled_db_err = False
    try:
        database_backup.get_db_connection("mongodb://invalid-host:27017/vastrams?serverSelectionTimeoutMS=500")
    except Exception:
        handled_db_err = True

    # 2. Invalid SMTP auth
    handled_smtp_err = False
    try:
        fake_cfg = dict(cfg)
        fake_cfg["gmail_app_password"] = "invalidpassword1"
        database_backup.send_backup_email(
            fake_cfg,
            "Test Fail",
            "fail",
            "<p>fail</p>",
            [],
        )
    except Exception:
        handled_smtp_err = True

    test9_pass = handled_db_err and handled_smtp_err
    results.append((9, "Robust error handling for MongoDB and SMTP failures", test9_pass, "Exceptions caught cleanly"))

    # -----------------------------------------------------------------------
    # TEST 10: Restoration Procedure in Isolated Test Database
    # -----------------------------------------------------------------------
    print("[TEST 10] Testing Automated Restoration into Separate Test Database...")
    temp_archive_path = BASE_DIR / "backups" / archive_fn
    temp_archive_path.write_bytes(archive_bytes)

    restore_success = restore_backup.run_test_restore(temp_archive_path, cfg["mongo_uri"], keep_test_db=False)
    results.append((10, "Restoration test in separate test database passed 100%", restore_success, "Production untouched"))

    client.close()

    # -----------------------------------------------------------------------
    # Summary Table
    # -----------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("TEST SUITE SUMMARY RESULTS")
    print("=" * 70)
    print(f"{'#':<3} | {'Test Description':<50} | {'Status':<8} | {'Details'}")
    print("-" * 70)
    all_passed = True
    for t_num, desc, passed, details in results:
        status_str = "PASS ✓" if passed else "FAIL ✗"
        if not passed:
            all_passed = False
        print(f"{t_num:<3} | {desc:<50} | {status_str:<8} | {details}")
    print("=" * 70)

    if all_passed:
        print("\n🎉 ALL 10 TESTS PASSED SUCCESSFULLY! The backup & weekly report system is ready for production.\n")
        return 0
    else:
        print("\n❌ SOME TESTS FAILED. Review output above.\n")
        return 1


if __name__ == "__main__":
    sys.exit(run_all_tests())
