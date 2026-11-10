# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "python-dotenv>=1.0.0",
#   "pymongo>=4.6.0",
#   "dnspython>=2.4.0",
# ]
# ///
"""
Vastrams Daily Finance Report Emailer
=====================================
Flow:
  Vastrams Database (MongoDB / optional SQLite)
    -> Python script (generate daily plain-text + HTML report + optional CSV)
    -> Gmail SMTP (smtp.gmail.com, port 587, STARTTLS with Google App Password)
    -> Daily report arrives in recipient inbox(es)

Setup:
  1. pip install python-dotenv pymongo dnspython
  2. Copy .env.example to .env and fill in GMAIL_ADDRESS, GMAIL_APP_PASSWORD,
     REPORT_TO, and MONGO_URI (or DB_PATH).
  3. Ensure .env and daily_report.log are listed in .gitignore.
  4. Test dry-run (no email sent):  python daily_report.py --dry-run
  5. Test live send for today:      python daily_report.py
     Test live send for past date:  python daily_report.py --date 2026-11-07
"""

import argparse
import csv
import html
import io
import logging
import os
import smtplib
import sqlite3
import ssl
import subprocess
import sys
from datetime import date, datetime, time, timedelta, timezone
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# STEP 0: Paths, IST Timezone, Environment Loading, and File Logging Setup
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
IST = timezone(timedelta(hours=5, minutes=30), name="IST")
LOG_FILE = BASE_DIR / "daily_report.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("vastrams.daily_report")

# Load root .env first; fall back to backend/.env only for MONGO_URI if missing
load_dotenv(BASE_DIR / ".env")
backend_env = BASE_DIR / "backend" / ".env"
if not os.getenv("MONGO_URI") and backend_env.exists():
    for _line in backend_env.read_text(encoding="utf-8", errors="ignore").splitlines():
        if _line.strip().startswith("MONGO_URI="):
            os.environ["MONGO_URI"] = _line.split("=", 1)[1].strip().strip('"').strip("'")
            break


def format_inr(amount: float | int | None) -> str:
    """Format a numeric amount in Indian Rupee grouping (e.g., 1,37,200.00)."""
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


def to_ist_str(dt_val: Any) -> str:
    """Convert a datetime or ISO string to an IST readable timestamp."""
    if not dt_val:
        return "—"
    if isinstance(dt_val, str):
        try:
            dt_val = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
        except ValueError:
            return dt_val
    if isinstance(dt_val, datetime):
        if dt_val.tzinfo is None:
            dt_val = dt_val.replace(tzinfo=timezone.utc)
        return dt_val.astimezone(IST).strftime("%d-%b-%Y %I:%M %p IST")
    return str(dt_val)


def load_config() -> dict[str, Any]:
    """Load and validate environment configuration from .env."""
    gmail_address = (os.getenv("GMAIL_ADDRESS") or "").strip()
    gmail_app_password = (os.getenv("GMAIL_APP_PASSWORD") or "").replace(" ", "").strip()
    raw_recipients = os.getenv("REPORT_TO") or gmail_address
    report_to = [r.strip() for r in raw_recipients.split(",") if r.strip()]
    mongo_uri = (os.getenv("MONGO_URI") or "").strip()
    db_path = (os.getenv("DB_PATH") or "").strip()
    attach_csv = (os.getenv("ATTACH_CSV") or "true").strip().lower() in ("1", "true", "yes", "on")

    missing = []
    if not gmail_address:
        missing.append("GMAIL_ADDRESS")
    if not gmail_app_password:
        missing.append("GMAIL_APP_PASSWORD")
    if not report_to:
        missing.append("REPORT_TO")
    if not mongo_uri and not db_path:
        missing.append("MONGO_URI (or DB_PATH)")

    if missing:
        raise RuntimeError(
            f"Missing required environment variable(s) in .env: {', '.join(missing)}. "
            "See .env.example for setup instructions."
        )

    return {
        "gmail_address": gmail_address,
        "gmail_app_password": gmail_app_password,
        "report_to": report_to,
        "mongo_uri": mongo_uri,
        "db_path": db_path,
        "attach_csv": attach_csv,
    }


# ---------------------------------------------------------------------------
# STEP 1: Query Only Today's Data (+ Vastrams Outstanding & Cheque Snapshot)
# ---------------------------------------------------------------------------
def fetch_mongodb_data(mongo_uri: str, target_date: date) -> dict[str, Any]:
    """Pull today's IST financial activity and live outstanding/cheque snapshot from Vastrams MongoDB."""
    from pymongo import MongoClient

    ist_start = datetime.combine(target_date, time.min, tzinfo=IST)
    ist_end = ist_start + timedelta(days=1)
    start_utc = ist_start.astimezone(timezone.utc)
    end_utc = ist_end.astimezone(timezone.utc)

    # Also capture calendar-day UTC midnight records (e.g. billDate/chequeDate saved at 00:00Z)
    utc_day_start = datetime.combine(target_date, time.min, tzinfo=timezone.utc)
    utc_day_end = utc_day_start + timedelta(days=1)

    logger.info("Connecting to Vastrams MongoDB for IST date %s...", target_date.isoformat())
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=15000)
    try:
        client.admin.command("ping")
        db = client.get_default_database()
        if db is None:
            db = client["vastrams"]

        settings_doc = db["settings"].find_one({}) or {}
        company_name = settings_doc.get("businessName") or "Vastrams"

        vendors = list(db["vendors"].find({"isDeleted": False}))
        financiers = list(db["financiers"].find({"isDeleted": False}))
        vendor_map = {str(v["_id"]): v.get("name", "Unknown Vendor") for v in vendors}
        financier_map = {str(f["_id"]): f.get("name", "Unknown Financier") for f in financiers}

        # 1a. Today's unified ledger transactions (IST window)
        tx_cursor = db["transactions"].find(
            {
                "isDeleted": False,
                "$or": [
                    {"date": {"$gte": start_utc, "$lt": end_utc}},
                    {"createdAt": {"$gte": start_utc, "$lt": end_utc}},
                ],
            }
        ).sort([("date", 1), ("createdAt", 1)])

        today_transactions = []
        for tx in tx_cursor:
            party = "—"
            if tx.get("vendorId") and str(tx["vendorId"]) in vendor_map:
                party = f"{vendor_map[str(tx['vendorId'])]} (Vendor)"
            elif tx.get("financierId") and str(tx["financierId"]) in financier_map:
                party = f"{financier_map[str(tx['financierId'])]} (Financier)"

            today_transactions.append(
                {
                    "id": str(tx.get("_id", "")),
                    "timestamp": to_ist_str(tx.get("date") or tx.get("createdAt")),
                    "type": tx.get("type", "UNKNOWN"),
                    "party": party,
                    "reference_type": tx.get("referenceType", "—"),
                    "description": tx.get("description") or "—",
                    "amount": float(tx.get("amount") or 0),
                    "running_balance": float(tx.get("runningBalance") or 0),
                }
            )

        # 1b. Today's breakdown totals
        bills_posted_total = sum(
            t["amount"] for t in today_transactions if t["type"] == "BILL_POSTED"
        )
        vendor_payments_total = sum(
            t["amount"] for t in today_transactions if t["type"] == "BILL_PAID"
        )
        loan_drawdown_total = sum(
            t["amount"] for t in today_transactions if t["type"] == "LOAN_DRAWDOWN"
        )
        loan_repayment_total = sum(
            t["amount"]
            for t in today_transactions
            if t["type"] in ("LOAN_REPAYMENT", "REPAYMENT_PRINCIPAL", "REPAYMENT_INTEREST")
        )
        cheque_reversal_total = sum(
            t["amount"] for t in today_transactions if t["type"] == "CHEQUE_BOUNCED_REVERSAL"
        )

        # 1c. Current Vendor & Financier Outstanding Snapshot
        active_vendor_balances = sorted(
            [
                {
                    "name": v.get("name", "Unknown"),
                    "party_type": "Vendor",
                    "category": v.get("category") or v.get("type") or "—",
                    "outstanding": float(v.get("outstandingBalance") or 0),
                }
                for v in vendors
                if float(v.get("outstandingBalance") or 0) > 0
            ],
            key=lambda x: x["outstanding"],
            reverse=True,
        )
        active_financier_balances = sorted(
            [
                {
                    "name": f.get("name", "Unknown"),
                    "party_type": "Financier",
                    "category": f"{f.get('defaultInterestRate', 0)}% p.a.",
                    "outstanding": float(f.get("outstandingBalance") or 0),
                }
                for f in financiers
                if float(f.get("outstandingBalance") or 0) > 0
            ],
            key=lambda x: x["outstanding"],
            reverse=True,
        )

        total_vendor_outstanding = sum(v["outstanding"] for v in active_vendor_balances)
        total_financier_outstanding = sum(f["outstanding"] for f in active_financier_balances)

        # 1d. Pending / Due / Approaching / Bounced Cheques
        due_horizon = utc_day_end + timedelta(days=7)
        cheques_cursor = db["cheques"].find(
            {
                "isDeleted": False,
                "$or": [
                    {"status": "PENDING", "chequeDate": {"$lt": due_horizon}},
                    {"status": "BOUNCED"},
                ],
            }
        ).sort("chequeDate", 1)

        cheque_alerts = []
        for chq in cheques_cursor:
            chq_date = chq.get("chequeDate")
            if isinstance(chq_date, datetime) and chq_date.tzinfo is None:
                chq_date = chq_date.replace(tzinfo=timezone.utc)
            date_str = chq_date.strftime("%d-%b-%Y") if isinstance(chq_date, datetime) else "—"
            status = chq.get("status", "PENDING")
            urgency = status
            if status == "PENDING" and isinstance(chq_date, datetime):
                if chq_date < utc_day_start:
                    urgency = "OVERDUE / PAST DUE"
                elif chq_date < utc_day_end:
                    urgency = "DUE TODAY"
                else:
                    urgency = "APPROACHING (<=7d)"

            cheque_alerts.append(
                {
                    "cheque_number": chq.get("chequeNumber", "—"),
                    "party_name": chq.get("partyName", "—"),
                    "type": chq.get("type", "—"),
                    "amount": float(chq.get("amount") or 0),
                    "cheque_date": date_str,
                    "status": urgency,
                }
            )

        # 1e. Database alert notifications created today
        db_alerts = list(
            db["notifications"].find(
                {
                    "type": {"$in": ["alert", "error"]},
                    "createdAt": {"$gte": start_utc, "$lt": end_utc},
                }
            ).sort("createdAt", -1).limit(10)
        )
        db_error_messages = [
            f"[{to_ist_str(n.get('createdAt'))}] {n.get('title', 'Alert')}: {n.get('message', '')}"
            for n in db_alerts
        ]

        return {
            "source": "MongoDB (Vastrams)",
            "company_name": company_name,
            "date_str": target_date.isoformat(),
            "transactions": today_transactions,
            "summary": {
                "bills_posted": bills_posted_total,
                "vendor_payments": vendor_payments_total,
                "loan_drawdowns": loan_drawdown_total,
                "loan_repayments": loan_repayment_total,
                "cheque_reversals": cheque_reversal_total,
                "net_cash_outflow": vendor_payments_total + loan_repayment_total - loan_drawdown_total,
                "total_vendor_outstanding": total_vendor_outstanding,
                "total_financier_outstanding": total_financier_outstanding,
                "combined_outstanding": total_vendor_outstanding + total_financier_outstanding,
                "active_vendors_with_balance": len(active_vendor_balances),
                "active_financiers_with_balance": len(active_financier_balances),
            },
            "top_outstandings": active_vendor_balances[:8] + active_financier_balances[:5],
            "cheque_alerts": cheque_alerts,
            "db_error_messages": db_error_messages,
        }
    finally:
        client.close()


def fetch_sqlite_data(db_path: str, target_date: date) -> dict[str, Any]:
    """Optional SQLite fallback if DB_PATH points to a local SQLite database without MONGO_URI."""
    logger.info("Connecting to SQLite database at %s for %s...", db_path, target_date.isoformat())
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, date, description, category, amount, type
            FROM transactions
            WHERE date = ?
            ORDER BY id
            """,
            (target_date.isoformat(),),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    transactions = [
        {
            "id": str(r["id"]),
            "timestamp": str(r["date"]),
            "type": str(r["type"]).upper(),
            "party": str(r["category"]),
            "reference_type": "Transaction",
            "description": str(r["description"]),
            "amount": float(r["amount"]),
            "running_balance": 0.0,
        }
        for r in rows
    ]
    income = sum(r["amount"] for r in transactions if r["type"].lower() == "income")
    expense = sum(r["amount"] for r in transactions if r["type"].lower() == "expense")
    return {
        "source": f"SQLite ({db_path})",
        "company_name": "Vastrams",
        "date_str": target_date.isoformat(),
        "transactions": transactions,
        "summary": {
            "bills_posted": expense,
            "vendor_payments": expense,
            "loan_drawdowns": income,
            "loan_repayments": 0.0,
            "cheque_reversals": 0.0,
            "net_cash_outflow": expense - income,
            "total_vendor_outstanding": 0.0,
            "total_financier_outstanding": 0.0,
            "combined_outstanding": 0.0,
            "active_vendors_with_balance": 0,
            "active_financiers_with_balance": 0,
        },
        "top_outstandings": [],
        "cheque_alerts": [],
        "db_error_messages": [],
    }


def fetch_today_git_commits(target_date: date) -> list[str]:
    """Collect git commits authored on target_date in IST (optional section)."""
    since_str = f"{target_date.isoformat()} 00:00:00 +0530"
    until_str = f"{target_date.isoformat()} 23:59:59 +0530"
    try:
        result = subprocess.run(
            [
                "git",
                "log",
                f"--since={since_str}",
                f"--until={until_str}",
                "--pretty=format:%h | %ad | %an | %s",
                "--date=format:%H:%M IST",
            ],
            cwd=BASE_DIR,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if result.returncode != 0:
            return []
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]
    except Exception as exc:
        logger.warning("Could not read git commits: %s", exc)
        return []


def fetch_recent_log_errors(target_date: date, db_error_messages: list[str]) -> list[str]:
    """Scan local *.log files for error entries from target_date, combined with DB error alerts."""
    errors = list(db_error_messages)
    date_prefix = target_date.isoformat()
    skip_dirs = {".git", "node_modules", ".venv", "dist", "build", "__pycache__"}
    error_markers = ("[ERROR]", "[CRITICAL]", "ERROR:", "Traceback (most recent call last)", "Unhandled")

    for root, dirs, files in os.walk(BASE_DIR):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for filename in files:
            if not filename.endswith(".log"):
                continue
            log_path = Path(root) / filename
            try:
                lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
                for line in lines[-500:]:
                    if date_prefix in line and any(marker in line for marker in error_markers):
                        rel_name = log_path.relative_to(BASE_DIR)
                        errors.append(f"[{rel_name}] {line.strip()}")
            except Exception as exc:
                logger.warning("Could not inspect log file %s: %s", log_path, exc)

    return errors[-15:]


def fetch_today_data(cfg: dict[str, Any], target_date: date) -> dict[str, Any]:
    """Orchestrate database, git commit, and application log queries for target_date."""
    mongo_uri = cfg["mongo_uri"]
    db_path = cfg["db_path"]

    if not mongo_uri and db_path.startswith(("mongodb://", "mongodb+srv://")):
        mongo_uri = db_path

    if mongo_uri:
        report = fetch_mongodb_data(mongo_uri, target_date)
    else:
        report = fetch_sqlite_data(db_path, target_date)

    report["git_commits"] = fetch_today_git_commits(target_date)
    report["log_errors"] = fetch_recent_log_errors(target_date, report.pop("db_error_messages", []))
    return report


# ---------------------------------------------------------------------------
# STEP 2: Build Plain-Text, Clean HTML Report, and Optional CSV Attachment
# ---------------------------------------------------------------------------
def build_csv_attachment(report: dict[str, Any]) -> bytes:
    """Serialize today's transaction rows into an Excel-friendly UTF-8-SIG CSV byte buffer."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Date / Time (IST)",
            "Transaction Type",
            "Party",
            "Reference Type",
            "Description",
            "Amount (INR)",
            "Running Balance (INR)",
        ]
    )
    for tx in report["transactions"]:
        writer.writerow(
            [
                tx["timestamp"],
                tx["type"],
                tx["party"],
                tx["reference_type"],
                tx["description"],
                f"{tx['amount']:.2f}",
                f"{tx['running_balance']:.2f}",
            ]
        )
    return output.getvalue().encode("utf-8-sig")


def build_report(report: dict[str, Any]) -> tuple[str, str]:
    """Generate both plain-text and clean HTML versions of the daily financial report."""
    company = report["company_name"]
    today_str = report["date_str"]
    txs = report["transactions"]
    summary = report["summary"]
    outstandings = report["top_outstandings"]
    cheques = report["cheque_alerts"]
    commits = report["git_commits"]
    log_errors = report["log_errors"]

    # --- Plain Text Body ---
    text_lines = [
        f"{company.upper()} - DAILY FINANCE REPORT ({today_str} IST)",
        "=" * 64,
        "",
        "1. TODAY'S SUMMARY",
        f"  - Bills Posted:         {format_inr(summary['bills_posted'])}",
        f"  - Vendor Payments:      {format_inr(summary['vendor_payments'])}",
        f"  - Loan Drawdowns:       {format_inr(summary['loan_drawdowns'])}",
        f"  - Loan Repayments:      {format_inr(summary['loan_repayments'])}",
        f"  - Cheque Reversals:     {format_inr(summary['cheque_reversals'])}",
        f"  - Net Cash Outflow:     {format_inr(summary['net_cash_outflow'])}",
        "",
        "2. TODAY'S TRANSACTIONS",
    ]
    if txs:
        for t in txs:
            text_lines.append(
                f"  * [{t['timestamp']}] {t['type']} | {t['party']} | "
                f"{format_inr(t['amount'])} | {t['description']} "
                f"(Bal: {format_inr(t['running_balance'])})"
            )
    else:
        text_lines.append("  No activity recorded today.")

    text_lines += [
        "",
        "3. CURRENT OUTSTANDING BALANCES",
        f"  - Total Vendor Payables ({summary['active_vendors_with_balance']} active):    {format_inr(summary['total_vendor_outstanding'])}",
        f"  - Total Loan Outstanding ({summary['active_financiers_with_balance']} active):  {format_inr(summary['total_financier_outstanding'])}",
        f"  - Combined Total Outstanding:           {format_inr(summary['combined_outstanding'])}",
    ]
    if outstandings:
        for o in outstandings:
            text_lines.append(
                f"  * {o['name']} [{o['party_type']}]: {format_inr(o['outstanding'])}"
            )

    text_lines += ["", "4. PENDING / DUE & BOUNCED CHEQUES"]
    if cheques:
        for c in cheques:
            text_lines.append(
                f"  * #{c['cheque_number']} | {c['party_name']} | {c['cheque_date']} | "
                f"{format_inr(c['amount'])} | {c['status']}"
            )
    else:
        text_lines.append("  No pending/due or bounced cheques.")

    text_lines += ["", "5. GIT COMMITS MADE TODAY"]
    if commits:
        text_lines.extend(f"  * {c}" for c in commits)
    else:
        text_lines.append("  No git commits recorded today.")

    text_lines += ["", "6. APPLICATION LOG ERRORS & SYSTEM ALERTS"]
    if log_errors:
        text_lines.extend(f"  ! {e}" for e in log_errors)
    else:
        text_lines.append("  No errors found in application logs today.")

    text_body = "\n".join(text_lines)

    # --- Clean HTML Body ---
    esc = html.escape
    if txs:
        tx_rows_html = "".join(
            f"<tr>"
            f"<td style='padding:8px;border:1px solid #e2e8f0'>{esc(t['timestamp'])}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0'><b>{esc(t['type'])}</b></td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0'>{esc(t['party'])}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0'>{esc(t['description'])}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0;text-align:right;font-weight:600'>{esc(format_inr(t['amount']))}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0;text-align:right'>{esc(format_inr(t['running_balance']))}</td>"
            f"</tr>"
            for t in txs
        )
    else:
        tx_rows_html = (
            "<tr><td colspan='6' style='padding:14px;border:1px solid #e2e8f0;"
            "text-align:center;color:#64748b;font-style:italic'>No activity recorded today.</td></tr>"
        )

    if outstandings:
        outstanding_rows_html = "".join(
            f"<tr>"
            f"<td style='padding:8px;border:1px solid #e2e8f0'>{esc(o['name'])}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0'>{esc(o['party_type'])}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0'>{esc(str(o['category']))}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0;text-align:right;font-weight:700;color:#be123c'>{esc(format_inr(o['outstanding']))}</td>"
            f"</tr>"
            for o in outstandings
        )
    else:
        outstanding_rows_html = (
            "<tr><td colspan='4' style='padding:10px;border:1px solid #e2e8f0;text-align:center;color:#64748b'>"
            "All vendor and financier accounts are settled (₹0.00).</td></tr>"
        )

    if cheques:
        cheque_rows_html = "".join(
            f"<tr>"
            f"<td style='padding:8px;border:1px solid #e2e8f0;font-family:monospace'>#{esc(c['cheque_number'])}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0'>{esc(c['party_name'])}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0'>{esc(c['cheque_date'])}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0;text-align:right;font-weight:600'>{esc(format_inr(c['amount']))}</td>"
            f"<td style='padding:8px;border:1px solid #e2e8f0'>{esc(c['status'])}</td>"
            f"</tr>"
            for c in cheques
        )
    else:
        cheque_rows_html = (
            "<tr><td colspan='5' style='padding:10px;border:1px solid #e2e8f0;text-align:center;color:#64748b'>"
            "No pending/due or bounced cheques.</td></tr>"
        )

    commits_html = (
        "<ul style='margin:6px 0;padding-left:20px'>"
        + "".join(f"<li style='margin:3px 0;font-family:monospace;font-size:12px'>{esc(c)}</li>" for c in commits)
        + "</ul>"
        if commits
        else "<p style='color:#64748b;font-style:italic;margin:6px 0'>No git commits recorded today.</p>"
    )

    errors_html = (
        "<ul style='margin:6px 0;padding-left:20px;color:#b91c1c'>"
        + "".join(f"<li style='margin:3px 0;font-family:monospace;font-size:12px'>{esc(e)}</li>" for e in log_errors)
        + "</ul>"
        if log_errors
        else "<p style='color:#047857;margin:6px 0'>No errors found in application logs today.</p>"
    )

    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;margin:0;padding:20px">
  <div style="max-width:780px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px">
    <h1 style="margin:0 0 4px 0;font-size:20px;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px">
      {esc(company)} &mdash; Daily Finance Report
    </h1>
    <p style="margin:0 0 18px 0;font-size:13px;color:#64748b">
      Report Date: <b>{esc(today_str)} (IST)</b> &bull; Source: {esc(report['source'])}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;font-size:13px">
      <tr>
        <td style="padding:10px;border:1px solid #e2e8f0;background:#f1f5f9"><b>Bills Posted Today</b><br>{esc(format_inr(summary['bills_posted']))}</td>
        <td style="padding:10px;border:1px solid #e2e8f0;background:#f1f5f9"><b>Vendor Payments Today</b><br>{esc(format_inr(summary['vendor_payments']))}</td>
        <td style="padding:10px;border:1px solid #e2e8f0;background:#f1f5f9"><b>Loan Drawdowns / Repaid</b><br>{esc(format_inr(summary['loan_drawdowns']))} / {esc(format_inr(summary['loan_repayments']))}</td>
        <td style="padding:10px;border:1px solid #e2e8f0;background:#fff1f2;color:#9f1239"><b>Combined Outstanding</b><br>{esc(format_inr(summary['combined_outstanding']))}</td>
      </tr>
    </table>

    <h3 style="margin:18px 0 8px 0;font-size:14px;text-transform:uppercase;color:#334155">1. Today's Transactions</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#0f172a;color:#ffffff;text-align:left">
          <th style="padding:8px;border:1px solid #0f172a">Time (IST)</th>
          <th style="padding:8px;border:1px solid #0f172a">Type</th>
          <th style="padding:8px;border:1px solid #0f172a">Party</th>
          <th style="padding:8px;border:1px solid #0f172a">Description</th>
          <th style="padding:8px;border:1px solid #0f172a;text-align:right">Amount</th>
          <th style="padding:8px;border:1px solid #0f172a;text-align:right">Running Bal</th>
        </tr>
      </thead>
      <tbody>{tx_rows_html}</tbody>
    </table>

    <h3 style="margin:22px 0 8px 0;font-size:14px;text-transform:uppercase;color:#334155">
      2. Vendor &amp; Financier Current Outstanding
      <span style="font-weight:400;font-size:12px;color:#64748b">
        (Vendors: {esc(format_inr(summary['total_vendor_outstanding']))} &bull; Loans: {esc(format_inr(summary['total_financier_outstanding']))})
      </span>
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#f1f5f9;color:#1e293b;text-align:left">
          <th style="padding:8px;border:1px solid #e2e8f0">Party Name</th>
          <th style="padding:8px;border:1px solid #e2e8f0">Role</th>
          <th style="padding:8px;border:1px solid #e2e8f0">Category / Rate</th>
          <th style="padding:8px;border:1px solid #e2e8f0;text-align:right">Outstanding</th>
        </tr>
      </thead>
      <tbody>{outstanding_rows_html}</tbody>
    </table>

    <h3 style="margin:22px 0 8px 0;font-size:14px;text-transform:uppercase;color:#334155">3. Pending / Approaching &amp; Bounced Cheques</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#f1f5f9;color:#1e293b;text-align:left">
          <th style="padding:8px;border:1px solid #e2e8f0">Cheque #</th>
          <th style="padding:8px;border:1px solid #e2e8f0">Party</th>
          <th style="padding:8px;border:1px solid #e2e8f0">Cheque Date</th>
          <th style="padding:8px;border:1px solid #e2e8f0;text-align:right">Amount</th>
          <th style="padding:8px;border:1px solid #e2e8f0">Status</th>
        </tr>
      </thead>
      <tbody>{cheque_rows_html}</tbody>
    </table>

    <h3 style="margin:22px 0 4px 0;font-size:14px;text-transform:uppercase;color:#334155">4. Git Commits Made Today</h3>
    {commits_html}

    <h3 style="margin:18px 0 4px 0;font-size:14px;text-transform:uppercase;color:#334155">5. Application Log Errors &amp; Alerts</h3>
    {errors_html}

    <p style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
      Automated daily summary sent by {esc(company)} Finance Automation at {esc(datetime.now(IST).strftime('%d-%b-%Y %I:%M %p IST'))}.
    </p>
  </div>
</body>
</html>"""

    return text_body, html_body


# ---------------------------------------------------------------------------
# STEP 3: Send Email via Gmail SMTP (Port 587 STARTTLS) with Optional CSV
# ---------------------------------------------------------------------------
def _smtp_login_single(server: smtplib.SMTP, user: str, password: str) -> None:
    """Authenticate once with AUTH PLAIN so Gmail 535 errors surface cleanly without retry disconnect."""
    server.user = user
    server.password = password
    server.auth("PLAIN", server.auth_plain, initial_response_ok=True)


def send_email(
    cfg: dict[str, Any],
    subject: str,
    text_body: str,
    html_body: str,
    csv_bytes: bytes | None = None,
    csv_filename: str | None = None,
) -> None:
    """Send multipart plain-text + HTML email (plus optional CSV) via smtp.gmail.com:587 STARTTLS."""
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = cfg["gmail_address"]
    msg["To"] = ", ".join(cfg["report_to"])

    alt_part = MIMEMultipart("alternative")
    alt_part.attach(MIMEText(text_body, "plain", "utf-8"))
    alt_part.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt_part)

    if csv_bytes is not None and csv_filename:
        attachment = MIMEBase("text", "csv")
        attachment.set_payload(csv_bytes)
        encoders.encode_base64(attachment)
        attachment.add_header("Content-Disposition", f'attachment; filename="{csv_filename}"')
        msg.attach(attachment)
        logger.info("Attached CSV file: %s (%d bytes)", csv_filename, len(csv_bytes))

    tls_context = ssl.create_default_context()
    logger.info("Connecting to smtp.gmail.com:587 (STARTTLS) as %s...", cfg["gmail_address"])
    with smtplib.SMTP("smtp.gmail.com", 587, local_hostname="localhost", timeout=20) as server:
        server.ehlo()
        server.starttls(context=tls_context)
        server.ehlo()
        _smtp_login_single(server, cfg["gmail_address"], cfg["gmail_app_password"])
        server.sendmail(cfg["gmail_address"], cfg["report_to"], msg.as_string())


# ---------------------------------------------------------------------------
# STEP 4: Main Entrypoint & CLI Support
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Send daily Vastrams Finance Report email.")
    parser.add_argument("--date", help="Report date in YYYY-MM-DD (IST). Defaults to today IST.")
    parser.add_argument("--dry-run", action="store_true", help="Build report and log output without sending email.")
    parser.add_argument("--no-csv", action="store_true", help="Disable CSV attachment for this run.")
    args = parser.parse_args()

    try:
        target_date = date.fromisoformat(args.date) if args.date else datetime.now(IST).date()
        cfg = load_config()
        report = fetch_today_data(cfg, target_date)
        text_body, html_body = build_report(report)

        csv_bytes = None
        csv_filename = None
        if cfg["attach_csv"] and not args.no_csv and report["transactions"]:
            csv_bytes = build_csv_attachment(report)
            csv_filename = f"vastrams_daily_report_{report['date_str']}.csv"
        elif cfg["attach_csv"] and not args.no_csv:
            logger.info("No transactions recorded for %s; skipping empty CSV attachment.", report["date_str"])

        subject = f"{report['company_name']} Daily Finance Report - {report['date_str']}"

        if args.dry_run:
            logger.info("DRY RUN enabled — email was NOT sent.\n%s", text_body)
            return 0

        send_email(cfg, subject, text_body, html_body, csv_bytes, csv_filename)
        logger.info("Daily report sent for %s to %s", report["date_str"], ", ".join(cfg["report_to"]))
        return 0

    except smtplib.SMTPAuthenticationError as exc:
        logger.error(
            "Gmail SMTP authentication failed (%s). Verify GMAIL_ADDRESS and that GMAIL_APP_PASSWORD "
            "is a valid 16-character Google App Password (no spaces) with 2-Step Verification enabled.",
            exc,
        )
        return 1
    except Exception as exc:
        logger.exception("Daily report execution failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
