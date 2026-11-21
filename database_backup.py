#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "python-dotenv>=1.0.0",
#   "pymongo>=4.6.0",
#   "dnspython>=2.4.0",
#   "openpyxl>=3.1.0",
# ]
# ///
"""
Vastrams Daily Database Backup Engine
=====================================
Exports all MongoDB collections into:
  1. A complete, multi-worksheet Excel workbook (Vastrams_Database_Backup_YYYY-MM-DD.xlsx)
  2. A native BSON restore archive with indexes (Vastrams_MongoDB_Restore_YYYY-MM-DD.tar.gz)

Verifies every exported record count against MongoDB, checks email size limits,
and emails both verified attachments to configured recipient(s) via Gmail SMTP STARTTLS.
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import smtplib
import ssl
import sys
import tarfile
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

# Ensure local .venv packages are found if running on Windows
BASE_DIR = Path(__file__).resolve().parent
LOCAL_VENV_PACKAGES = BASE_DIR / ".venv" / "Lib" / "site-packages"
if LOCAL_VENV_PACKAGES.exists() and str(LOCAL_VENV_PACKAGES) not in sys.path:
    sys.path.insert(0, str(LOCAL_VENV_PACKAGES))

import bson
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from dotenv import load_dotenv
import pymongo
from bson import json_util

# ---------------------------------------------------------------------------
# Setup Timezone, Paths & Logging
# ---------------------------------------------------------------------------
IST = timezone(timedelta(hours=5, minutes=30), name="IST")
BACKUP_LOG_FILE = BASE_DIR / "database_backup.log"
BACKUPS_DIR = BASE_DIR / "backups"
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(BACKUP_LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("vastrams.backup")

# Load environment configuration
load_dotenv(BASE_DIR / ".env")
backend_env = BASE_DIR / "backend" / ".env"
if not os.getenv("MONGO_URI") and backend_env.exists():
    for _line in backend_env.read_text(encoding="utf-8", errors="ignore").splitlines():
        if _line.strip().startswith("MONGO_URI="):
            os.environ["MONGO_URI"] = _line.split("=", 1)[1].strip().strip('"').strip("'")
            break


# ---------------------------------------------------------------------------
# Configuration Helpers
# ---------------------------------------------------------------------------
def load_config(require_email: bool = True) -> dict[str, Any]:
    """Load and validate required environment variables securely across local and CI environments."""
    gmail_address = (
        os.getenv("GMAIL_ADDRESS")
        or os.getenv("GMAIL_USER")
        or os.getenv("SMTP_USER")
        or ""
    ).strip()

    gmail_app_password = (
        os.getenv("GMAIL_APP_PASSWORD")
        or os.getenv("GMAIL_PASSWORD")
        or os.getenv("SMTP_PASS")
        or ""
    ).strip().replace(" ", "")

    report_to_raw = (
        os.getenv("REPORT_TO")
        or os.getenv("REPORT_RECIPIENT")
        or gmail_address
        or ""
    ).strip()

    mongo_uri = (
        os.getenv("MONGO_URI")
        or os.getenv("MONGODB_URI")
        or os.getenv("DATABASE_URL")
        or ""
    ).strip()

    missing: list[str] = []
    if not mongo_uri:
        missing.append("MONGO_URI (or MONGODB_URI / DATABASE_URL)")

    if require_email:
        if not gmail_address:
            missing.append("GMAIL_ADDRESS (or GMAIL_USER / SMTP_USER)")
        if not gmail_app_password:
            missing.append("GMAIL_APP_PASSWORD (or GMAIL_PASSWORD / SMTP_PASS)")
        if not report_to_raw:
            missing.append("REPORT_TO (or REPORT_RECIPIENT / GMAIL_ADDRESS)")

    if missing:
        raise ValueError(
            f"Configuration error: Missing required setting(s): {', '.join(missing)}. "
            "In GitHub Actions, configure these in Repository Settings -> Secrets and variables -> Actions."
        )

    recipients = [addr.strip() for addr in report_to_raw.split(",") if addr.strip()] if report_to_raw else []

    return {
        "gmail_address": gmail_address,
        "gmail_app_password": gmail_app_password,
        "report_to": recipients,
        "mongo_uri": mongo_uri,
    }


def get_db_connection(mongo_uri: str) -> tuple[pymongo.MongoClient, pymongo.database.Database]:
    """Connect to MongoDB and return client and database handle."""
    client = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=10000)
    db = client.get_default_database()
    if db is None:
        db = client["vastrams"]
    # Trigger a lightweight ping to verify connection
    client.admin.command("ping")
    return client, db


# ---------------------------------------------------------------------------
# Formatting & Serialization Helpers
# ---------------------------------------------------------------------------
def format_inr(amount: float | int | None) -> str:
    """Format numeric amount in Indian Rupee format."""
    val = float(amount or 0)
    sign = "-" if val < 0 else ""
    abs_val = abs(val)
    int_part, dec_part = f"{abs_val:.2f}".split(".")
    if len(int_part) <= 3:
        grouped = int_part
    else:
        last_three = int_part[-3:]
        rest = int_part[:-3]
        chunks = []
        while len(rest) > 2:
            chunks.append(rest[-2:])
            rest = rest[:-2]
        if rest:
            chunks.append(rest)
        grouped = ",".join(reversed(chunks)) + "," + last_three
    return f"{sign}₹{grouped}.{dec_part}"


def sanitize_for_excel(value: Any) -> Any:
    """Recursively convert BSON/MongoDB values into Excel-safe types."""
    if value is None:
        return ""
    if isinstance(value, bson.ObjectId):
        return str(value)
    if isinstance(value, datetime):
        # Localize to IST for clarity if timezone naive or UTC
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        ist_dt = value.astimezone(IST)
        return ist_dt.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=json_util.default, ensure_ascii=False)
    return str(value)


# Clean title mapping for collection tabs
COLLECTION_DISPLAY_NAMES = {
    "bills": "Purchase Bills",
    "cheques": "Cheque Register",
    "financiers": "Financiers",
    "invoicetemplates": "Invoice Templates",
    "loans": "Loans",
    "lockdowns": "Lockdowns",
    "notifications": "Notifications",
    "otpverifications": "OTP Verifications",
    "payments": "Vendor Payments",
    "pendinginvites": "Pending Invites",
    "repayments": "Loan Repayments",
    "settings": "Company Settings",
    "transactions": "Transactions",
    "users": "Users",
    "vendors": "Vendors",
}


# ---------------------------------------------------------------------------
# 1. Excel Backup Generation
# ---------------------------------------------------------------------------
def generate_excel_backup(
    db: pymongo.database.Database,
    backup_dt: datetime,
) -> tuple[bytes, str, dict[str, int]]:
    """
    Export all MongoDB collections into a formatted, verified Excel workbook.
    Returns (excel_bytes, filename, record_counts).
    """
    wb = openpyxl.Workbook()
    # Remove default sheet
    default_sheet = wb.active
    wb.remove(default_sheet)

    # Styles
    font_title = Font(name="Segoe UI", size=14, bold=True, color="FFFFFF")
    font_sub = Font(name="Segoe UI", size=10, italic=True, color="E2E8F0")
    font_header = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    font_data = Font(name="Segoe UI", size=9)
    font_bold = Font(name="Segoe UI", size=9, bold=True)
    font_ok = Font(name="Segoe UI", size=9, bold=True, color="008000")

    fill_brand = PatternFill(start_color="008060", end_color="008060", fill_type="solid")  # Emerald Dark
    fill_header = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid") # Slate Dark
    fill_alt = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    fill_summary_header = PatternFill(start_color="00A87E", end_color="00A87E", fill_type="solid")

    thin_border = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )

    collections = sorted(db.list_collection_names())
    # Exclude internal system collections if any
    collections = [c for c in collections if not c.startswith("system.")]

    record_counts: dict[str, int] = {}
    exported_counts: dict[str, int] = {}

    # Sheet 1: Backup Summary Manifest
    ws_summary = wb.create_sheet(title="Backup Summary")
    ws_summary.views.sheetView[0].showGridLines = True

    ws_summary.merge_cells("A1:F1")
    ws_summary["A1"] = "VASTRAMS — DATABASE BACKUP & INTEGRITY MANIFEST"
    ws_summary["A1"].font = font_title
    ws_summary["A1"].fill = fill_brand
    ws_summary["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws_summary.row_dimensions[1].height = 36

    ws_summary.merge_cells("A2:F2")
    ws_summary["A2"] = (
        f"Generated: {backup_dt.strftime('%d-%b-%Y %I:%M:%S %p IST')}  |  "
        f"Database: {db.name}  |  Platform: Vastrams Enterprise Finance"
    )
    ws_summary["A2"].font = font_sub
    ws_summary["A2"].fill = fill_brand
    ws_summary["A2"].alignment = Alignment(horizontal="center", vertical="center")
    ws_summary.row_dimensions[2].height = 20

    summary_headers = ["No.", "Collection Name", "Worksheet Name", "Records in DB", "Exported Rows", "Integrity Status"]
    ws_summary.row_dimensions[4].height = 24
    for col_idx, h in enumerate(summary_headers, start=1):
        cell = ws_summary.cell(row=4, column=col_idx, value=h)
        cell.font = font_header
        cell.fill = fill_summary_header
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border

    summary_row_idx = 5

    # Process each collection
    for col_no, col_name in enumerate(collections, start=1):
        db_count = db[col_name].count_documents({})
        record_counts[col_name] = db_count

        display_name = COLLECTION_DISPLAY_NAMES.get(col_name, col_name.title())
        # Excel worksheet names are max 31 chars
        sheet_title = display_name[:31]

        ws = wb.create_sheet(title=sheet_title)
        ws.views.sheetView[0].showGridLines = True
        ws.freeze_panes = "A2"

        # Fetch all documents
        cursor = db[col_name].find({})
        docs = list(cursor)

        if not docs:
            # Empty collection sheet
            ws.cell(row=1, column=1, value="(Empty Collection)").font = font_header
            ws.cell(row=1, column=1).fill = fill_header
            exported_counts[col_name] = 0
        else:
            # Gather unique column headers, placing _id first
            keys_order: list[str] = ["_id"]
            for d in docs:
                for k in d.keys():
                    if k != "_id" and k not in keys_order:
                        keys_order.append(k)

            # Write header row
            ws.row_dimensions[1].height = 24
            for c_idx, k in enumerate(keys_order, start=1):
                c = ws.cell(row=1, column=c_idx, value=k)
                c.font = font_header
                c.fill = fill_header
                c.alignment = Alignment(horizontal="center", vertical="center")
                c.border = thin_border

            # Write data rows
            for r_idx, doc in enumerate(docs, start=2):
                ws.row_dimensions[r_idx].height = 18
                is_even = r_idx % 2 == 0
                for c_idx, k in enumerate(keys_order, start=1):
                    raw_val = doc.get(k)
                    val = sanitize_for_excel(raw_val)
                    c = ws.cell(row=r_idx, column=c_idx, value=val)
                    c.font = font_data
                    c.border = thin_border
                    if is_even:
                        c.fill = fill_alt

                    # Alignments
                    if isinstance(val, (int, float)):
                        c.alignment = Alignment(horizontal="right", vertical="center")
                    elif isinstance(val, bool):
                        c.alignment = Alignment(horizontal="center", vertical="center")
                    else:
                        c.alignment = Alignment(horizontal="left", vertical="center")

            exported_counts[col_name] = len(docs)

            # Auto-fit column widths
            for col in ws.columns:
                max_len = max(len(str(cell.value or "")) for cell in col)
                col_letter = get_column_letter(col[0].column)
                ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 50)

        # Record in Summary Manifest sheet
        ws_summary.row_dimensions[summary_row_idx].height = 20
        status_text = "MATCH ✓" if db_count == exported_counts[col_name] else "MISMATCH ✗"

        row_vals = [
            col_no,
            col_name,
            sheet_title,
            db_count,
            exported_counts[col_name],
            status_text,
        ]
        for c_idx, val in enumerate(row_vals, start=1):
            c = ws_summary.cell(row=summary_row_idx, column=c_idx, value=val)
            c.border = thin_border
            if c_idx in (1, 4, 5):
                c.alignment = Alignment(horizontal="center", vertical="center")
            elif c_idx == 6:
                c.alignment = Alignment(horizontal="center", vertical="center")
                c.font = font_ok if status_text == "MATCH ✓" else Font(color="FF0000", bold=True)
            else:
                c.alignment = Alignment(horizontal="left", vertical="center")
            if summary_row_idx % 2 == 0 and c_idx != 6:
                c.fill = fill_alt

        summary_row_idx += 1

    # Totals row in Summary Manifest
    total_db_records = sum(record_counts.values())
    total_exported_records = sum(exported_counts.values())
    ws_summary.row_dimensions[summary_row_idx].height = 22

    ws_summary.cell(row=summary_row_idx, column=1, value="").border = thin_border
    ws_summary.cell(row=summary_row_idx, column=2, value="TOTAL ALL COLLECTIONS").font = font_bold
    ws_summary.cell(row=summary_row_idx, column=2).border = thin_border
    ws_summary.cell(row=summary_row_idx, column=3, value=f"{len(collections)} collections").font = font_bold
    ws_summary.cell(row=summary_row_idx, column=3).border = thin_border

    c_tot_db = ws_summary.cell(row=summary_row_idx, column=4, value=total_db_records)
    c_tot_db.font = font_bold
    c_tot_db.alignment = Alignment(horizontal="center", vertical="center")
    c_tot_db.border = thin_border

    c_tot_exp = ws_summary.cell(row=summary_row_idx, column=5, value=total_exported_records)
    c_tot_exp.font = font_bold
    c_tot_exp.alignment = Alignment(horizontal="center", vertical="center")
    c_tot_exp.border = thin_border

    all_matched = total_db_records == total_exported_records
    c_tot_status = ws_summary.cell(
        row=summary_row_idx,
        column=6,
        value="100% VERIFIED ✓" if all_matched else "VERIFICATION FAILED ✗",
    )
    c_tot_status.font = font_ok if all_matched else Font(color="FF0000", bold=True)
    c_tot_status.alignment = Alignment(horizontal="center", vertical="center")
    c_tot_status.border = thin_border

    # Auto-fit Summary sheet
    for col in ws_summary.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws_summary.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 45)

    # Save to buffer
    bio = io.BytesIO()
    wb.save(bio)
    excel_bytes = bio.getvalue()

    filename = f"Vastrams_Database_Backup_{backup_dt.strftime('%Y-%m-%d')}.xlsx"
    return excel_bytes, filename, record_counts


# ---------------------------------------------------------------------------
# 2. Native BSON MongoDB Restore Archive Generation
# ---------------------------------------------------------------------------
def generate_mongodb_restore_archive(
    db: pymongo.database.Database,
    backup_dt: datetime,
) -> tuple[bytes, str, dict[str, int]]:
    """
    Export all MongoDB collections in native BSON format with index metadata into a .tar.gz archive.
    Returns (tar_gz_bytes, filename, record_counts).
    """
    collections = sorted(db.list_collection_names())
    collections = [c for c in collections if not c.startswith("system.")]

    record_counts: dict[str, int] = {}
    manifest_data = {
        "version": "1.0",
        "app_name": "Vastrams",
        "database": db.name,
        "backup_date_ist": backup_dt.strftime("%Y-%m-%d %H:%M:%S IST"),
        "backup_date_utc": backup_dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "collections": {},
    }

    tar_bio = io.BytesIO()
    with tarfile.open(fileobj=tar_bio, mode="w:gz") as tar:
        for col_name in collections:
            cursor = db[col_name].find({})
            bson_buffer = bytearray()
            doc_count = 0
            for doc in cursor:
                bson_buffer.extend(bson.BSON.encode(doc))
                doc_count += 1

            record_counts[col_name] = doc_count

            # Add <collection>.bson to tarball
            bson_bytes = bytes(bson_buffer)
            bson_ti = tarfile.TarInfo(name=f"{db.name}/{col_name}.bson")
            bson_ti.size = len(bson_bytes)
            bson_ti.mtime = int(backup_dt.timestamp())
            tar.addfile(bson_ti, io.BytesIO(bson_bytes))

            # Fetch index metadata
            try:
                indexes = list(db[col_name].list_indexes())
            except Exception:
                indexes = []

            meta_content = {
                "collection": col_name,
                "count": doc_count,
                "indexes": indexes,
            }
            meta_json = json.dumps(meta_content, default=json_util.default, indent=2).encode("utf-8")
            meta_ti = tarfile.TarInfo(name=f"{db.name}/{col_name}.metadata.json")
            meta_ti.size = len(meta_json)
            meta_ti.mtime = int(backup_dt.timestamp())
            tar.addfile(meta_ti, io.BytesIO(meta_json))

            manifest_data["collections"][col_name] = {
                "count": doc_count,
                "bson_bytes": len(bson_bytes),
                "index_count": len(indexes),
            }

        # Add manifest.json to tarball
        manifest_bytes = json.dumps(manifest_data, indent=2).encode("utf-8")
        man_ti = tarfile.TarInfo(name=f"{db.name}/manifest.json")
        man_ti.size = len(manifest_bytes)
        man_ti.mtime = int(backup_dt.timestamp())
        tar.addfile(man_ti, io.BytesIO(manifest_bytes))

    tar_gz_bytes = tar_bio.getvalue()
    filename = f"Vastrams_MongoDB_Restore_{backup_dt.strftime('%Y-%m-%d')}.tar.gz"
    return tar_gz_bytes, filename, record_counts


# ---------------------------------------------------------------------------
# 3. Verification Functions
# ---------------------------------------------------------------------------
def verify_excel_backup(excel_bytes: bytes, expected_counts: dict[str, int]) -> bool:
    """Read the generated Excel workbook and verify sheet row counts match MongoDB counts."""
    wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), read_only=True)
    all_matched = True

    for col_name, expected_count in expected_counts.items():
        display_name = COLLECTION_DISPLAY_NAMES.get(col_name, col_name.title())[:31]
        if display_name not in wb.sheetnames:
            logger.error("Verification failed: sheet '%s' missing from Excel backup!", display_name)
            return False

        ws = wb[display_name]
        # Count non-header rows
        row_count = 0
        for idx, row in enumerate(ws.iter_rows(values_only=True)):
            if idx == 0:
                # Check if it was an empty collection indicator
                if row and row[0] == "(Empty Collection)":
                    row_count = 0
                    break
                continue
            if any(cell is not None and str(cell).strip() != "" for cell in row):
                row_count += 1

        if row_count != expected_count:
            logger.error(
                "Verification failed for collection '%s': DB count=%d, Excel row count=%d",
                col_name,
                expected_count,
                row_count,
            )
            all_matched = False

    return all_matched


def verify_mongodb_archive(tar_gz_bytes: bytes, expected_counts: dict[str, int]) -> bool:
    """Read back the BSON archive and assert document counts match database counts."""
    with tarfile.open(fileobj=io.BytesIO(tar_gz_bytes), mode="r:gz") as tar:
        names = tar.getnames()
        for col_name, expected_count in expected_counts.items():
            bson_entry = [n for n in names if n.endswith(f"/{col_name}.bson")]
            if not bson_entry:
                logger.error("Verification failed: '%s.bson' missing in archive!", col_name)
                return False

            member = tar.getmember(bson_entry[0])
            f = tar.extractfile(member)
            if f is None:
                logger.error("Could not extract '%s' from archive!", bson_entry[0])
                return False

            raw_bson = f.read()
            if expected_count == 0:
                if len(raw_bson) != 0:
                    logger.error("Expected 0 bytes for empty collection '%s', got %d", col_name, len(raw_bson))
                    return False
            else:
                docs = bson.decode_all(raw_bson)
                if len(docs) != expected_count:
                    logger.error(
                        "Verification failed for '%s': DB count=%d, Archive BSON count=%d",
                        col_name,
                        expected_count,
                        len(docs),
                    )
                    return False

    return True


# ---------------------------------------------------------------------------
# 4. Email Notification Generator
# ---------------------------------------------------------------------------
def build_backup_email_content(
    backup_dt: datetime,
    db_name: str,
    record_counts: dict[str, int],
    excel_filename: str,
    excel_size: int,
    archive_filename: str,
    archive_size: int,
) -> tuple[str, str]:
    """Generate professional plain-text and HTML email notification."""
    total_records = sum(record_counts.values())
    total_collections = len(record_counts)
    total_size_mb = (excel_size + archive_size) / (1024 * 1024)

    text_body = f"""VASTRAMS — DAILY DATABASE BACKUP CONFIRMATION
=================================================
Backup Date:      {backup_dt.strftime('%d-%b-%Y %I:%M:%S %p IST')}
Database Name:    {db_name}
Total Collections:{total_collections}
Total Records:    {total_records:,}
Status:           100% VERIFIED & INTEGRITY-CHECKED ✓

ATTACHMENTS INCLUDED:
1. {excel_filename} ({excel_size / 1024:.1f} KB)
   -> Formatted Excel workbook with individual sheets for all collections.
2. {archive_filename} ({archive_size / 1024:.1f} KB)
   -> Native MongoDB BSON dump with indexes, ready for point-in-time restore.

COLLECTION BREAKDOWN:
"""
    for col, cnt in sorted(record_counts.items()):
        text_body += f"  - {col:18}: {cnt:,} records\n"

    text_body += f"""
HOW TO RESTORE:
To restore the database using the attached archive, run:
  python restore_backup.py --archive {archive_filename} --target-db vastrams

Automated backup generated by Vastrams Database Protection System.
"""

    # HTML rows
    table_rows_html = ""
    for idx, (col, cnt) in enumerate(sorted(record_counts.items()), start=1):
        bg = "#f8fafc" if idx % 2 == 0 else "#ffffff"
        display_name = COLLECTION_DISPLAY_NAMES.get(col, col.title())
        table_rows_html += f"""
        <tr style="background:{bg};border-bottom:1px solid #e2e8f0">
          <td style="padding:7px 10px;color:#64748b;font-size:11px;text-align:center">{idx}</td>
          <td style="padding:7px 10px;font-weight:600;color:#0f172a">{col}</td>
          <td style="padding:7px 10px;color:#475569">{display_name}</td>
          <td style="padding:7px 10px;font-weight:700;color:#008060;text-align:right">{cnt:,}</td>
          <td style="padding:7px 10px;text-align:center;color:#008060;font-weight:700">✓ Validated</td>
        </tr>
        """

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vastrams Daily Database Backup</title>
</head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1);border:1px solid #e2e8f0">
    
    <!-- Top Header -->
    <div style="background:linear-gradient(135deg, #008060 0%, #004d3a 100%);padding:28px 32px;color:#ffffff">
      <div style="display:inline-block;padding:4px 10px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px">
        Daily Database Backup &amp; Archive
      </div>
      <h1 style="margin:0 0 6px 0;font-size:24px;font-weight:800;letter-spacing:-0.5px">Vastrams Database Backup</h1>
      <p style="margin:0;font-size:13px;color:#d1fae5">
        Generated on <strong>{backup_dt.strftime('%d-%b-%Y at %I:%M %p IST')}</strong> &bull; Database: <strong>{db_name}</strong>
      </p>
    </div>

    <!-- KPI Summary Grid -->
    <div style="display:flex;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:16px 24px">
      <div style="flex:1;text-align:center;border-right:1px solid #e2e8f0;padding:0 8px">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Total Collections</div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:2px">{total_collections}</div>
      </div>
      <div style="flex:1;text-align:center;border-right:1px solid #e2e8f0;padding:0 8px">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Total Documents</div>
        <div style="font-size:22px;font-weight:800;color:#008060;margin-top:2px">{total_records:,}</div>
      </div>
      <div style="flex:1;text-align:center;border-right:1px solid #e2e8f0;padding:0 8px">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Integrity Status</div>
        <div style="font-size:18px;font-weight:800;color:#008060;margin-top:4px">100% Passed ✓</div>
      </div>
      <div style="flex:1;text-align:center;padding:0 8px">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Total Attached</div>
        <div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:2px">{total_size_mb:.2f} MB</div>
      </div>
    </div>

    <div style="padding:28px 32px">
      <!-- Attached Files Box -->
      <h2 style="margin:0 0 12px 0;font-size:15px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px">Attached Backup Files</h2>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:24px">
        <div style="display:flex;align-items:center;margin-bottom:10px">
          <div style="font-size:20px;margin-right:10px">📊</div>
          <div>
            <div style="font-weight:700;font-size:13px;color:#166534">{excel_filename}</div>
            <div style="font-size:12px;color:#15803d">Multi-worksheet spreadsheet for human viewing, audits, and spreadsheet analysis ({excel_size / 1024:.1f} KB)</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;padding-top:10px;border-top:1px dashed #bbf7d0">
          <div style="font-size:20px;margin-right:10px">🗄️</div>
          <div>
            <div style="font-weight:700;font-size:13px;color:#166534">{archive_filename}</div>
            <div style="font-size:12px;color:#15803d">Native BSON MongoDB dump with index metadata, ready for complete point-in-time database restoration ({archive_size / 1024:.1f} KB)</div>
          </div>
        </div>
      </div>

      <!-- Collection Table -->
      <h2 style="margin:0 0 12px 0;font-size:15px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px">Collection Manifest &amp; Verification</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#008060;color:#ffffff;text-align:left">
            <th style="padding:8px 10px;text-align:center;width:40px">#</th>
            <th style="padding:8px 10px">Collection</th>
            <th style="padding:8px 10px">Worksheet</th>
            <th style="padding:8px 10px;text-align:right">Records</th>
            <th style="padding:8px 10px;text-align:center">Verification</th>
          </tr>
        </thead>
        <tbody>
          {table_rows_html}
        </tbody>
      </table>

      <!-- Restore Documentation Snippet -->
      <div style="margin-top:24px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#475569">
        <strong style="color:#0f172a">Database Restore Procedure:</strong><br>
        In the event of data loss, extract and restore using the included script:<br>
        <code style="display:block;background:#0f172a;color:#f8fafc;padding:8px 12px;border-radius:4px;margin-top:6px;font-family:Consolas,monospace">
          python restore_backup.py --archive {archive_filename} --target-db vastrams
        </code>
      </div>

      <p style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">
        Automated database protection service &bull; Vastrams Enterprise Finance &bull; Confidential Business Data
      </p>
    </div>
  </div>
</body>
</html>
"""
    return text_body, html_body


# ---------------------------------------------------------------------------
# 5. SMTP Dispatcher
# ---------------------------------------------------------------------------
def _smtp_login_single(server: smtplib.SMTP, user: str, password: str) -> None:
    """Authenticate with AUTH PLAIN for reliable Gmail SMTP login."""
    server.user = user
    server.password = password
    server.auth("PLAIN", server.auth_plain, initial_response_ok=True)


def send_backup_email(
    cfg: dict[str, Any],
    subject: str,
    text_body: str,
    html_body: str,
    attachments: list[tuple[str, bytes, str]],  # [(filename, content_bytes, mime_type)]
) -> None:
    """Send multipart email with verified backup attachments via Gmail STARTTLS."""
    # Check total size
    total_bytes = sum(len(b) for _, b, _ in attachments)
    if total_bytes > 22 * 1024 * 1024:
        raise ValueError(
            f"Total backup attachment size ({total_bytes / (1024*1024):.2f} MB) exceeds "
            "safe Gmail SMTP limit (22 MB). Aborting email dispatch to prevent delivery failure."
        )

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = cfg["gmail_address"]
    msg["To"] = ", ".join(cfg["report_to"])

    alt_part = MIMEMultipart("alternative")
    alt_part.attach(MIMEText(text_body, "plain", "utf-8"))
    alt_part.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt_part)

    for filename, content, mime_type in attachments:
        maintype, subtype = mime_type.split("/", 1)
        part = MIMEBase(maintype, subtype)
        part.set_payload(content)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
        msg.attach(part)
        logger.info("Attached file: %s (%d bytes)", filename, len(content))

    tls_context = ssl.create_default_context()
    logger.info("Connecting to smtp.gmail.com:587 (STARTTLS) as %s...", cfg["gmail_address"])
    with smtplib.SMTP("smtp.gmail.com", 587, local_hostname="localhost", timeout=30) as server:
        server.ehlo()
        server.starttls(context=tls_context)
        server.ehlo()
        _smtp_login_single(server, cfg["gmail_address"], cfg["gmail_app_password"])
        server.sendmail(cfg["gmail_address"], cfg["report_to"], msg.as_string())


# ---------------------------------------------------------------------------
# 6. Main Orchestrator
# ---------------------------------------------------------------------------
def run_backup(dry_run: bool = False, no_email: bool = False, output_dir: Path | None = None) -> int:
    """Generate, verify, save, and email daily database backups."""
    backup_dt = datetime.now(IST)
    save_dir = output_dir or BACKUPS_DIR
    save_dir.mkdir(parents=True, exist_ok=True)

    logger.info("=" * 60)
    logger.info("Starting Vastrams Daily Database Backup for %s...", backup_dt.strftime("%Y-%m-%d %H:%M:%S IST"))
    logger.info("=" * 60)

    try:
        # Load configuration (checks DB URI; email credentials checked based on mode)
        cfg = load_config(require_email=not (dry_run or no_email))
    except Exception as exc:
        logger.error("%s", exc)
        return 1

    try:
        client, db = get_db_connection(cfg["mongo_uri"])
        logger.info("Connected to MongoDB database: %s", db.name)
    except Exception as exc:
        logger.error("MongoDB connection failed: %s", exc)
        return 1

    try:
        # Step 1: Generate Excel Backup
        logger.info("Generating Excel workbook backup with openpyxl...")
        excel_bytes, excel_filename, db_counts = generate_excel_backup(db, backup_dt)
        logger.info("Generated Excel backup: %s (%d bytes, %d collections)", excel_filename, len(excel_bytes), len(db_counts))

        # Step 2: Generate MongoDB BSON Restore Archive
        logger.info("Generating native BSON restore archive with indexes...")
        archive_bytes, archive_filename, _ = generate_mongodb_restore_archive(db, backup_dt)
        logger.info("Generated MongoDB restore archive: %s (%d bytes)", archive_filename, len(archive_bytes))

        # Step 3: Verification of both generated backups
        logger.info("Verifying Excel workbook integrity...")
        if not verify_excel_backup(excel_bytes, db_counts):
            raise RuntimeError("Excel backup integrity verification failed! Record counts mismatch.")
        logger.info("✓ Excel workbook 100% verified.")

        logger.info("Verifying MongoDB restore archive integrity...")
        if not verify_mongodb_archive(archive_bytes, db_counts):
            raise RuntimeError("MongoDB restore archive verification failed! BSON counts mismatch.")
        logger.info("✓ MongoDB restore archive 100% verified.")

        # Step 4: Save local copy in backups directory
        excel_path = save_dir / excel_filename
        archive_path = save_dir / archive_filename
        excel_path.write_bytes(excel_bytes)
        archive_path.write_bytes(archive_bytes)
        logger.info("Saved local backup copies to: %s and %s", excel_path, archive_path)

        if dry_run or no_email:
            logger.info("DRY-RUN or NO-EMAIL enabled. Backup created and verified successfully. Email NOT sent.")
            return 0

        # Step 5: Verify email configuration before sending
        if not cfg.get("gmail_address") or not cfg.get("gmail_app_password") or not cfg.get("report_to"):
            raise ValueError(
                "Cannot send email: Email credentials missing in environment. "
                "Ensure GMAIL_ADDRESS and GMAIL_APP_PASSWORD are set in GitHub Secrets."
            )

        # Step 6: Build Email Content
        text_body, html_body = build_backup_email_content(
            backup_dt=backup_dt,
            db_name=db.name,
            record_counts=db_counts,
            excel_filename=excel_filename,
            excel_size=len(excel_bytes),
            archive_filename=archive_filename,
            archive_size=len(archive_bytes),
        )

        subject = f"Vastrams — Daily Database Backup [{backup_dt.strftime('%Y-%m-%d')}] — 100% Verified"

        # Step 7: Send Email with both attachments
        attachments = [
            (excel_filename, excel_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            (archive_filename, archive_bytes, "application/gzip"),
        ]
        send_backup_email(cfg, subject, text_body, html_body, attachments)
        logger.info("✓ Backup email delivered successfully to: %s", ", ".join(cfg["report_to"]))
        return 0

    except Exception as exc:
        logger.exception("Backup execution failed: %s", exc)
        return 1
    finally:
        try:
            client.close()
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Vastrams Daily Database Backup & Restore Archive Engine")
    parser.add_argument("--dry-run", action="store_true", help="Generate and verify backups without sending email.")
    parser.add_argument("--no-email", action="store_true", help="Save backups locally without emailing.")
    parser.add_argument("--output-dir", type=Path, help="Custom directory to save backup files.")
    args = parser.parse_args()

    return run_backup(dry_run=args.dry_run, no_email=args.no_email, output_dir=args.output_dir)


if __name__ == "__main__":
    sys.exit(main())
