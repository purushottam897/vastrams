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
Vastrams Weekly Business Report Engine
======================================
Compiles and emails a comprehensive weekly executive business report summarizing:
  - Weekly Bills Created & Status Breakdown
  - Weekly Payments Settled & Mode Distribution
  - Vendor-wise Payments & Current Outstanding Balances
  - Cheques Issued, Cleared, Bounced & Upcoming Cheques
  - Financier Loans, Drawdowns & Repayments
  - Notable Business Transactions

Generates responsive HTML email with KPI metrics and attaches an itemized CSV summary.
"""

from __future__ import annotations

import argparse
import csv
import html
import io
import logging
import os
import smtplib
import ssl
import sys
from datetime import date, datetime, time, timedelta, timezone
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

from dotenv import load_dotenv
import pymongo

IST = timezone(timedelta(hours=5, minutes=30), name="IST")
REPORT_LOG_FILE = BASE_DIR / "weekly_report.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(REPORT_LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("vastrams.weekly_report")

# Load environment configuration
load_dotenv(BASE_DIR / ".env")
backend_env = BASE_DIR / "backend" / ".env"
if not os.getenv("MONGO_URI") and backend_env.exists():
    for _line in backend_env.read_text(encoding="utf-8", errors="ignore").splitlines():
        if _line.strip().startswith("MONGO_URI="):
            os.environ["MONGO_URI"] = _line.split("=", 1)[1].strip().strip('"').strip("'")
            break


def load_config() -> dict[str, Any]:
    gmail_address = (os.getenv("GMAIL_ADDRESS") or "").strip()
    gmail_app_password = (os.getenv("GMAIL_APP_PASSWORD") or "").strip().replace(" ", "")
    report_to_raw = os.getenv("REPORT_TO", "").strip()
    mongo_uri = (os.getenv("MONGO_URI") or "").strip()

    if not gmail_address:
        raise ValueError("GMAIL_ADDRESS missing in environment (.env).")
    if not gmail_app_password:
        raise ValueError("GMAIL_APP_PASSWORD missing in environment (.env).")
    if not report_to_raw:
        raise ValueError("REPORT_TO missing in environment (.env).")
    if not mongo_uri:
        raise ValueError("MONGO_URI missing in environment (.env or backend/.env).")

    recipients = [addr.strip() for addr in report_to_raw.split(",") if addr.strip()]
    if not recipients:
        raise ValueError("No valid recipient addresses in REPORT_TO.")

    return {
        "gmail_address": gmail_address,
        "gmail_app_password": gmail_app_password,
        "report_to": recipients,
        "mongo_uri": mongo_uri,
    }


def format_inr(amount: float | int | None) -> str:
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


def parse_doc_datetime(val: Any) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc).astimezone(IST)
        return val.astimezone(IST)
    if isinstance(val, date):
        return datetime.combine(val, time.min, tzinfo=IST)
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            return dt.astimezone(IST)
        except Exception:
            return None
    return None


def fetch_weekly_data(
    mongo_uri: str,
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    """Fetch all weekly metrics from MongoDB database across collections."""
    client = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=10000)
    db = client.get_default_database()
    if db is None:
        db = client["vastrams"]

    # IST datetime boundaries
    start_dt = datetime.combine(start_date, time.min, tzinfo=IST)
    end_dt = datetime.combine(end_date, time.max, tzinfo=IST)
    start_utc = start_dt.astimezone(timezone.utc)
    end_utc = end_dt.astimezone(timezone.utc)

    # 1. Company Settings / Branding
    settings_doc = db["settings"].find_one() or {}
    company_name = settings_doc.get("businessName") or "Vastrams"

    # 2. Vendors map
    vendors_cursor = db["vendors"].find({"isDeleted": {"$ne": True}})
    vendors = list(vendors_cursor)
    vendor_map = {str(v["_id"]): v for v in vendors}

    total_vendor_outstanding = sum(float(v.get("outstandingBalance") or 0) for v in vendors)
    total_vendor_opening = sum(float(v.get("openingBalance") or 0) for v in vendors)

    # 3. Financiers map
    financiers_cursor = db["financiers"].find({"isDeleted": {"$ne": True}})
    financiers = list(financiers_cursor)
    financier_map = {str(f["_id"]): f for f in financiers}
    total_financier_outstanding = sum(float(f.get("outstandingBalance") or 0) for f in financiers)

    # 4. Bills created during week
    bill_query = {
        "isDeleted": {"$ne": True},
        "$or": [
            {"billDate": {"$gte": start_utc, "$lte": end_utc}},
            {"createdAt": {"$gte": start_utc, "$lte": end_utc}},
        ],
    }
    weekly_bills = list(db["bills"].find(bill_query).sort("billDate", pymongo.DESCENDING))

    total_bills_count = len(weekly_bills)
    total_bills_amount = sum(float(b.get("amount") or 0) for b in weekly_bills)
    total_bills_paid = sum(float(b.get("paidAmount") or 0) for b in weekly_bills)
    total_bills_unpaid = sum(float(b.get("outstandingAmount") or 0) for b in weekly_bills)

    # 5. Payments settled during week
    payment_query = {
        "isDeleted": {"$ne": True},
        "$or": [
            {"paymentDate": {"$gte": start_utc, "$lte": end_utc}},
            {"createdAt": {"$gte": start_utc, "$lte": end_utc}},
        ],
    }
    weekly_payments = list(db["payments"].find(payment_query).sort("paymentDate", pymongo.DESCENDING))

    total_payments_count = len(weekly_payments)
    total_payments_amount = sum(float(p.get("amount") or 0) for p in weekly_payments)

    # Payment modes breakdown
    mode_totals: dict[str, float] = {}
    vendor_payment_totals: dict[str, float] = {}
    for p in weekly_payments:
        mode = str(p.get("paymentMode") or "OTHER").replace("_", " ").title()
        amt = float(p.get("amount") or 0)
        mode_totals[mode] = mode_totals.get(mode, 0.0) + amt

        v_id = str(p.get("vendorId") or "")
        vendor_payment_totals[v_id] = vendor_payment_totals.get(v_id, 0.0) + amt

    # 6. Cheques Activity
    cheques_cursor = db["cheques"].find({"isDeleted": {"$ne": True}})
    all_cheques = list(cheques_cursor)

    cheques_bounced_week = []
    cheques_cleared_week = []
    cheques_issued_week = []
    upcoming_cheques = []

    today_ist = datetime.now(IST).date()
    fourteen_days_ahead = today_ist + timedelta(days=14)

    for c in all_cheques:
        c_status = c.get("status")
        c_dt = parse_doc_datetime(c.get("chequeDate"))
        c_date = c_dt.date() if c_dt else None

        if c_date and start_date <= c_date <= end_date:
            cheques_issued_week.append(c)

        if c_status == "BOUNCED":
            b_dt = parse_doc_datetime(c.get("bounceDate") or c.get("updatedAt"))
            if b_dt and start_date <= b_dt.date() <= end_date:
                cheques_bounced_week.append(c)

        if c_status == "CLEARED":
            u_dt = parse_doc_datetime(c.get("updatedAt"))
            if u_dt and start_date <= u_dt.date() <= end_date:
                cheques_cleared_week.append(c)

        if c_status == "PENDING" and c_date and today_ist <= c_date <= fourteen_days_ahead:
            upcoming_cheques.append(c)

    upcoming_cheques.sort(key=lambda x: parse_doc_datetime(x.get("chequeDate")) or datetime.max.replace(tzinfo=IST))

    # 7. Loans & Repayments
    loans_cursor = db["loans"].find({"isDeleted": {"$ne": True}})
    active_loans = [ln for ln in loans_cursor if ln.get("status") in ("ACTIVE", "OVERDUE")]
    total_active_loan_principal = sum(float(ln.get("outstandingPrincipal") or 0) for ln in active_loans)

    repayments_query = {
        "isDeleted": {"$ne": True},
        "$or": [
            {"repaymentDate": {"$gte": start_utc, "$lte": end_utc}},
            {"createdAt": {"$gte": start_utc, "$lte": end_utc}},
        ],
    }
    weekly_repayments = list(db["repayments"].find(repayments_query))
    weekly_repayment_principal = sum(float(r.get("principalPaid") or 0) for r in weekly_repayments)
    weekly_repayment_interest = sum(float(r.get("interestPaid") or 0) for r in weekly_repayments)

    # 8. Notable Transactions in week
    txns_query = {
        "isDeleted": {"$ne": True},
        "date": {"$gte": start_utc, "$lte": end_utc},
    }
    weekly_txns = list(db["transactions"].find(txns_query).sort("date", pymongo.DESCENDING).limit(10))

    client.close()

    return {
        "company_name": company_name,
        "start_date": start_date,
        "end_date": end_date,
        "start_str": start_date.strftime("%d-%b-%Y"),
        "end_str": end_date.strftime("%d-%b-%Y"),
        "total_vendor_outstanding": total_vendor_outstanding,
        "total_vendor_opening": total_vendor_opening,
        "total_financier_outstanding": total_financier_outstanding,
        "grand_total_outstanding": total_vendor_outstanding + total_financier_outstanding,
        "vendors": vendors,
        "vendor_map": vendor_map,
        "financier_map": financier_map,
        "weekly_bills": weekly_bills,
        "total_bills_count": total_bills_count,
        "total_bills_amount": total_bills_amount,
        "total_bills_paid": total_bills_paid,
        "total_bills_unpaid": total_bills_unpaid,
        "weekly_payments": weekly_payments,
        "total_payments_count": total_payments_count,
        "total_payments_amount": total_payments_amount,
        "mode_totals": mode_totals,
        "vendor_payment_totals": vendor_payment_totals,
        "cheques_issued_week": cheques_issued_week,
        "cheques_bounced_week": cheques_bounced_week,
        "cheques_cleared_week": cheques_cleared_week,
        "upcoming_cheques": upcoming_cheques,
        "active_loans": active_loans,
        "total_active_loan_principal": total_active_loan_principal,
        "weekly_repayments": weekly_repayments,
        "weekly_repayment_principal": weekly_repayment_principal,
        "weekly_repayment_interest": weekly_repayment_interest,
        "weekly_txns": weekly_txns,
    }


def build_weekly_html_report(data: dict[str, Any]) -> tuple[str, str]:
    """Generate executive plain-text and HTML report."""
    company = data["company_name"]
    start_str = data["start_str"]
    end_str = data["end_str"]

    # Text report
    text_body = f"""{company.upper()} — WEEKLY EXECUTIVE BUSINESS REPORT
=============================================================
Reporting Period: {start_str} to {end_str} (IST)
Generated on:     {datetime.now(IST).strftime('%d-%b-%Y %I:%M %p IST')}

KEY FINANCIAL HIGHLIGHTS:
-------------------------
- Weekly Bills Created:      {data['total_bills_count']} bills totaling {format_inr(data['total_bills_amount'])}
- Weekly Payments Settled:    {data['total_payments_count']} payments totaling {format_inr(data['total_payments_amount'])}
- Total Vendor Outstanding:  {format_inr(data['total_vendor_outstanding'])}
- Total Financier Exposure:  {format_inr(data['total_financier_outstanding'])}
- Grand Total Exposure:      {format_inr(data['grand_total_outstanding'])}

PAYMENT MODES DISTRIBUTION:
"""
    for mode, amt in sorted(data["mode_totals"].items(), key=lambda x: x[1], reverse=True):
        text_body += f"  - {mode:<18}: {format_inr(amt)}\n"

    text_body += f"""
UPCOMING CHEQUES (Next 14 Days): {len(data['upcoming_cheques'])} cheques
ACTIVE LOANS EXPOSURE:           {format_inr(data['total_active_loan_principal'])}

Detailed itemized CSV report is attached.
"""

    # HTML Mode rows
    mode_rows_html = ""
    for mode, amt in sorted(data["mode_totals"].items(), key=lambda x: x[1], reverse=True):
        pct = (amt / data["total_payments_amount"] * 100) if data["total_payments_amount"] > 0 else 0
        mode_rows_html += f"""
        <tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:7px 10px;font-weight:600;color:#0f172a">{html.escape(mode)}</td>
          <td style="padding:7px 10px;font-weight:700;color:#008060;text-align:right">{format_inr(amt)}</td>
          <td style="padding:7px 10px;color:#64748b;text-align:right">{pct:.1f}%</td>
        </tr>
        """
    if not mode_rows_html:
        mode_rows_html = '<tr><td colspan="3" style="padding:10px;text-align:center;color:#94a3b8">No payments recorded this week.</td></tr>'

    # Top Vendors by Outstanding Table
    sorted_vendors = sorted(data["vendors"], key=lambda v: float(v.get("outstandingBalance") or 0), reverse=True)[:8]
    vendor_rows_html = ""
    for idx, v in enumerate(sorted_vendors, start=1):
        v_id = str(v.get("_id"))
        v_name = v.get("name") or "Unnamed Vendor"
        op_bal = float(v.get("openingBalance") or 0)
        curr_out = float(v.get("outstandingBalance") or 0)
        paid_wk = data["vendor_payment_totals"].get(v_id, 0.0)

        bg = "#f8fafc" if idx % 2 == 0 else "#ffffff"
        vendor_rows_html += f"""
        <tr style="background:{bg};border-bottom:1px solid #e2e8f0">
          <td style="padding:7px 10px;font-weight:600;color:#0f172a">{html.escape(v_name)}</td>
          <td style="padding:7px 10px;color:#64748b;text-align:right">{format_inr(op_bal)}</td>
          <td style="padding:7px 10px;font-weight:600;color:#008060;text-align:right">{format_inr(paid_wk)}</td>
          <td style="padding:7px 10px;font-weight:700;color:#dc2626;text-align:right">{format_inr(curr_out)}</td>
        </tr>
        """
    if not vendor_rows_html:
        vendor_rows_html = '<tr><td colspan="4" style="padding:10px;text-align:center;color:#94a3b8">No vendors registered.</td></tr>'

    # Upcoming Cheques rows
    upcoming_chq_html = ""
    for c in data["upcoming_cheques"][:6]:
        c_num = c.get("chequeNumber") or "—"
        p_name = c.get("partyName") or "—"
        c_dt = parse_doc_datetime(c.get("chequeDate"))
        dt_str = c_dt.strftime("%d-%b-%Y") if c_dt else "—"
        amt = float(c.get("amount") or 0)

        upcoming_chq_html += f"""
        <tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:6px 10px;font-family:monospace;font-weight:700;color:#0f172a">#{html.escape(c_num)}</td>
          <td style="padding:6px 10px;color:#334155">{html.escape(p_name)}</td>
          <td style="padding:6px 10px;color:#64748b;text-align:center">{dt_str}</td>
          <td style="padding:6px 10px;font-weight:700;color:#0f172a;text-align:right">{format_inr(amt)}</td>
        </tr>
        """
    if not upcoming_chq_html:
        upcoming_chq_html = '<tr><td colspan="4" style="padding:8px;text-align:center;color:#94a3b8">No upcoming cheques scheduled in the next 14 days.</td></tr>'

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{html.escape(company)} Weekly Business Report</title>
</head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1);border:1px solid #e2e8f0">
    
    <!-- Top Brand Header -->
    <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%);padding:28px 32px;color:#ffffff;border-bottom:4px solid #008060">
      <div style="display:inline-block;padding:4px 10px;background:rgba(0,128,96,0.3);border:1px solid #008060;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;color:#a7f3d0">
        Weekly Executive Briefing
      </div>
      <h1 style="margin:0 0 6px 0;font-size:24px;font-weight:800;letter-spacing:-0.5px">{html.escape(company)} Weekly Business Report</h1>
      <p style="margin:0;font-size:13px;color:#cbd5e1">
        Coverage Period: <strong>{start_str}</strong> to <strong>{end_str}</strong> (IST) &bull; Generated: {datetime.now(IST).strftime('%d-%b-%Y %I:%M %p IST')}
      </p>
    </div>

    <!-- 4 KPI Box Matrix -->
    <div style="display:flex;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:16px 24px">
      <div style="flex:1;text-align:center;border-right:1px solid #e2e8f0;padding:0 8px">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Weekly Bills Posted</div>
        <div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:3px">{format_inr(data['total_bills_amount'])}</div>
        <div style="font-size:11px;color:#64748b">{data['total_bills_count']} bills</div>
      </div>
      <div style="flex:1;text-align:center;border-right:1px solid #e2e8f0;padding:0 8px">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Weekly Payments</div>
        <div style="font-size:20px;font-weight:800;color:#008060;margin-top:3px">{format_inr(data['total_payments_amount'])}</div>
        <div style="font-size:11px;color:#64748b">{data['total_payments_count']} settlements</div>
      </div>
      <div style="flex:1;text-align:center;border-right:1px solid #e2e8f0;padding:0 8px">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Vendor Outstanding</div>
        <div style="font-size:20px;font-weight:800;color:#dc2626;margin-top:3px">{format_inr(data['total_vendor_outstanding'])}</div>
        <div style="font-size:11px;color:#64748b">{len(data['vendors'])} active vendors</div>
      </div>
      <div style="flex:1;text-align:center;padding:0 8px">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Total Exposure</div>
        <div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:3px">{format_inr(data['grand_total_outstanding'])}</div>
        <div style="font-size:11px;color:#64748b">Vendors + Loans</div>
      </div>
    </div>

    <div style="padding:28px 32px">
      <!-- Section: Payment Modes -->
      <h2 style="margin:0 0 10px 0;font-size:14px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px">1. Payments Settled by Mode</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:24px">
        <thead>
          <tr style="background:#f1f5f9;color:#475569;text-align:left">
            <th style="padding:8px 10px">Payment Mode</th>
            <th style="padding:8px 10px;text-align:right">Total Settled</th>
            <th style="padding:8px 10px;text-align:right">Share</th>
          </tr>
        </thead>
        <tbody>
          {mode_rows_html}
        </tbody>
      </table>

      <!-- Section: Top Vendor Balances -->
      <h2 style="margin:0 0 10px 0;font-size:14px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px">2. Vendor Balances &amp; Weekly Settlement Summary</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:24px">
        <thead>
          <tr style="background:#f1f5f9;color:#475569;text-align:left">
            <th style="padding:8px 10px">Vendor Name</th>
            <th style="padding:8px 10px;text-align:right">Opening Bal</th>
            <th style="padding:8px 10px;text-align:right">Paid in Week</th>
            <th style="padding:8px 10px;text-align:right">Current Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {vendor_rows_html}
        </tbody>
      </table>

      <!-- Section: Upcoming Cheques -->
      <h2 style="margin:0 0 10px 0;font-size:14px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px">3. Upcoming Cheque Clearances (Next 14 Days)</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:24px">
        <thead>
          <tr style="background:#f1f5f9;color:#475569;text-align:left">
            <th style="padding:8px 10px">Cheque #</th>
            <th style="padding:8px 10px">Party Name</th>
            <th style="padding:8px 10px;text-align:center">Due Date</th>
            <th style="padding:8px 10px;text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {upcoming_chq_html}
        </tbody>
      </table>

      <!-- Section: Loans & Financiers Summary -->
      <h2 style="margin:0 0 10px 0;font-size:14px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px">4. Loans &amp; Financier Exposure</h2>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:12px;color:#334155;margin-bottom:24px">
        <div style="display:flex;justify-content:space-between;padding:4px 0">
          <span>Active Financier Loans:</span>
          <strong>{len(data['active_loans'])} loans</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:4px 0">
          <span>Outstanding Loan Principal:</span>
          <strong style="color:#008060">{format_inr(data['total_active_loan_principal'])}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:4px 0">
          <span>Weekly Principal Repaid:</span>
          <strong>{format_inr(data['weekly_repayment_principal'])}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:4px 0">
          <span>Weekly Interest Paid:</span>
          <strong>{format_inr(data['weekly_repayment_interest'])}</strong>
        </div>
      </div>

      <p style="margin:0;font-size:12px;color:#64748b;text-align:center">
        📎 Detailed transaction and vendor CSV report attached for your records.
      </p>

      <p style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">
        Automated executive report &bull; {html.escape(company)} Finance Automation &bull; Confidential
      </p>
    </div>
  </div>
</body>
</html>
"""
    return text_body, html_body


def build_weekly_csv(data: dict[str, Any]) -> bytes:
    """Generate multi-section CSV summary for the weekly report."""
    output = io.StringIO()
    writer = csv.writer(output)

    # 1. Title
    writer.writerow([f"{data['company_name']} Weekly Business Report"])
    writer.writerow(["Period", f"{data['start_str']} to {data['end_str']} IST"])
    writer.writerow(["Generated At", datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")])
    writer.writerow([])

    # 2. Key Metrics
    writer.writerow(["=== EXECUTIVE KPI SUMMARY ==="])
    writer.writerow(["Metric", "Value"])
    writer.writerow(["Weekly Bills Amount", data["total_bills_amount"]])
    writer.writerow(["Weekly Bills Count", data["total_bills_count"]])
    writer.writerow(["Weekly Payments Amount", data["total_payments_amount"]])
    writer.writerow(["Weekly Payments Count", data["total_payments_count"]])
    writer.writerow(["Total Vendor Outstanding", data["total_vendor_outstanding"]])
    writer.writerow(["Total Financier Outstanding", data["total_financier_outstanding"]])
    writer.writerow(["Grand Total Exposure", data["grand_total_outstanding"]])
    writer.writerow([])

    # 3. Weekly Bills
    writer.writerow(["=== WEEKLY BILLS CREATED ==="])
    writer.writerow(["Bill Number", "Vendor Name", "Bill Date", "Amount", "Paid Amount", "Outstanding Amount", "Status"])
    for b in data["weekly_bills"]:
        v_name = data["vendor_map"].get(str(b.get("vendorId")), {}).get("name", "—")
        b_dt = parse_doc_datetime(b.get("billDate"))
        dt_str = b_dt.strftime("%Y-%m-%d") if b_dt else "—"
        writer.writerow([
            b.get("billNumber", ""),
            v_name,
            dt_str,
            b.get("amount", 0),
            b.get("paidAmount", 0),
            b.get("outstandingAmount", 0),
            b.get("status", "UNPAID"),
        ])
    writer.writerow([])

    # 4. Weekly Payments
    writer.writerow(["=== WEEKLY PAYMENTS RECORDED ==="])
    writer.writerow(["Reference Number", "Vendor Name", "Payment Date", "Payment Mode", "Amount"])
    for p in data["weekly_payments"]:
        v_name = data["vendor_map"].get(str(p.get("vendorId")), {}).get("name", "—")
        p_dt = parse_doc_datetime(p.get("paymentDate"))
        dt_str = p_dt.strftime("%Y-%m-%d") if p_dt else "—"
        writer.writerow([
            p.get("referenceNumber", ""),
            v_name,
            dt_str,
            p.get("paymentMode", ""),
            p.get("amount", 0),
        ])
    writer.writerow([])

    # 5. Vendor Balances
    writer.writerow(["=== VENDOR BALANCES & SETTLEMENTS ==="])
    writer.writerow(["Vendor Name", "Phone", "Opening Balance", "Paid This Week", "Current Outstanding Balance", "Status"])
    for v in data["vendors"]:
        v_id = str(v.get("_id"))
        paid_wk = data["vendor_payment_totals"].get(v_id, 0.0)
        writer.writerow([
            v.get("name", ""),
            v.get("phone", ""),
            v.get("openingBalance", 0),
            paid_wk,
            v.get("outstandingBalance", 0),
            v.get("status", "Active"),
        ])
    writer.writerow([])

    # 6. Upcoming Cheques
    writer.writerow(["=== UPCOMING CHEQUES (NEXT 14 DAYS) ==="])
    writer.writerow(["Cheque Number", "Party Name", "Cheque Date", "Amount", "Bank", "Status"])
    for c in data["upcoming_cheques"]:
        c_dt = parse_doc_datetime(c.get("chequeDate"))
        dt_str = c_dt.strftime("%Y-%m-%d") if c_dt else "—"
        writer.writerow([
            c.get("chequeNumber", ""),
            c.get("partyName", ""),
            dt_str,
            c.get("amount", 0),
            c.get("bankName", ""),
            c.get("status", "PENDING"),
        ])

    return output.getvalue().encode("utf-8-sig")


def _smtp_login_single(server: smtplib.SMTP, user: str, password: str) -> None:
    server.user = user
    server.password = password
    server.auth("PLAIN", server.auth_plain, initial_response_ok=True)


def send_weekly_email(
    cfg: dict[str, Any],
    subject: str,
    text_body: str,
    html_body: str,
    csv_bytes: bytes | None,
    csv_filename: str | None,
) -> None:
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = cfg["gmail_address"]
    msg["To"] = ", ".join(cfg["report_to"])

    alt_part = MIMEMultipart("alternative")
    alt_part.attach(MIMEText(text_body, "plain", "utf-8"))
    alt_part.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt_part)

    if csv_bytes and csv_filename:
        part = MIMEBase("text", "csv")
        part.set_payload(csv_bytes)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{csv_filename}"')
        msg.attach(part)
        logger.info("Attached weekly CSV summary: %s (%d bytes)", csv_filename, len(csv_bytes))

    tls_context = ssl.create_default_context()
    logger.info("Connecting to smtp.gmail.com:587 (STARTTLS) as %s...", cfg["gmail_address"])
    with smtplib.SMTP("smtp.gmail.com", 587, local_hostname="localhost", timeout=30) as server:
        server.ehlo()
        server.starttls(context=tls_context)
        server.ehlo()
        _smtp_login_single(server, cfg["gmail_address"], cfg["gmail_app_password"])
        server.sendmail(cfg["gmail_address"], cfg["report_to"], msg.as_string())


def run_weekly_report(
    start_date: date | None = None,
    end_date: date | None = None,
    dry_run: bool = False,
    no_csv: bool = False,
) -> int:
    today_ist = datetime.now(IST).date()
    # Default: past 7 days (e.g. from 7 days ago to yesterday)
    e_date = end_date or today_ist
    s_date = start_date or (e_date - timedelta(days=7))

    logger.info("=" * 60)
    logger.info("Starting Vastrams Weekly Business Report for %s to %s IST...", s_date, e_date)
    logger.info("=" * 60)

    try:
        cfg = load_config()
    except Exception as exc:
        logger.error("Configuration error: %s", exc)
        return 1

    try:
        data = fetch_weekly_data(cfg["mongo_uri"], s_date, e_date)
        text_body, html_body = build_weekly_html_report(data)

        csv_bytes = None
        csv_filename = None
        if not no_csv:
            csv_bytes = build_weekly_csv(data)
            csv_filename = f"Vastrams_Weekly_Report_{s_date.strftime('%Y%m%d')}_{e_date.strftime('%Y%m%d')}.csv"

        subject = f"{data['company_name']} Weekly Business Report — [{data['start_str']} to {data['end_str']}]"

        if dry_run:
            logger.info("DRY RUN enabled. Email NOT sent.\n%s", text_body)
            return 0

        send_weekly_email(cfg, subject, text_body, html_body, csv_bytes, csv_filename)
        logger.info("✓ Weekly report delivered successfully to: %s", ", ".join(cfg["report_to"]))
        return 0

    except Exception as exc:
        logger.exception("Weekly report execution failed: %s", exc)
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Vastrams Weekly Business Report Engine")
    parser.add_argument("--start-date", help="Start date (YYYY-MM-DD in IST).")
    parser.add_argument("--end-date", help="End date (YYYY-MM-DD in IST).")
    parser.add_argument("--dry-run", action="store_true", help="Generate and print report without sending email.")
    parser.add_argument("--no-csv", action="store_true", help="Disable CSV attachment.")

    args = parser.parse_args()

    s_date = date.fromisoformat(args.start_date) if args.start_date else None
    e_date = date.fromisoformat(args.end_date) if args.end_date else None

    return run_weekly_report(start_date=s_date, end_date=e_date, dry_run=args.dry_run, no_csv=args.no_csv)


if __name__ == "__main__":
    sys.exit(main())
