"""
SQLite database for Spine AI: studies and reports from Orthanc and manual uploads.
"""
import sqlite3
import json
from pathlib import Path

DATABASE_PATH = Path(__file__).resolve().parent / "spine_studies.db"


def init_database():
    """Initialize database with tables."""
    conn = sqlite3.connect(str(DATABASE_PATH))
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS studies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            study_id TEXT UNIQUE NOT NULL,
            accession_number TEXT,
            patient_id TEXT,
            patient_name TEXT,
            study_date TEXT,
            study_description TEXT,
            series_count INTEGER,
            image_count INTEGER,
            status TEXT DEFAULT 'received',
            received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            analyzed_at TIMESTAMP,
            error_message TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            study_id TEXT NOT NULL,
            ai_report_text TEXT,
            ai_report_json TEXT,
            final_report_text TEXT,
            confidence_score REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (study_id) REFERENCES studies (study_id)
        )
    """)

    conn.commit()
    conn.close()


def insert_study(study_data):
    """Insert new study into database."""
    conn = sqlite3.connect(str(DATABASE_PATH))
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR IGNORE INTO studies
        (study_id, accession_number, patient_id, patient_name, study_date,
         study_description, series_count, image_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        study_data["study_id"],
        study_data.get("accession_number"),
        study_data.get("patient_id"),
        study_data.get("patient_name"),
        study_data.get("study_date"),
        study_data.get("study_description"),
        study_data.get("series_count", 0),
        study_data.get("image_count", 0),
        "received",
    ))

    conn.commit()
    conn.close()


def get_studies_by_status(status):
    """Get all studies with given status."""
    conn = sqlite3.connect(str(DATABASE_PATH))
    cursor = conn.cursor()

    cursor.execute(
        "SELECT * FROM studies WHERE status = ? ORDER BY received_at DESC",
        (status,),
    )

    columns = [d[0] for d in cursor.description]
    results = [dict(zip(columns, row)) for row in cursor.fetchall()]

    conn.close()
    return results


def update_study_status(study_id, status, error_message=None):
    """Update study status."""
    conn = sqlite3.connect(str(DATABASE_PATH))
    cursor = conn.cursor()

    if status == "analyzed":
        cursor.execute("""
            UPDATE studies
            SET status = ?, analyzed_at = CURRENT_TIMESTAMP, error_message = ?
            WHERE study_id = ?
        """, (status, error_message, study_id))
    else:
        cursor.execute("""
            UPDATE studies
            SET status = ?, error_message = ?
            WHERE study_id = ?
        """, (status, error_message, study_id))

    conn.commit()
    conn.close()


def save_report(study_id, ai_report_text, ai_report_json=None, confidence_score=None):
    """Save AI-generated report."""
    conn = sqlite3.connect(str(DATABASE_PATH))
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO reports (study_id, ai_report_text, ai_report_json, confidence_score)
        VALUES (?, ?, ?, ?)
    """, (
        study_id,
        ai_report_text,
        json.dumps(ai_report_json) if ai_report_json else None,
        confidence_score,
    ))

    conn.commit()
    conn.close()


def get_report(study_id):
    """Get latest report for a study. Returns dict with ai_report_text, ai_report_json, etc. or None."""
    conn = sqlite3.connect(str(DATABASE_PATH))
    cursor = conn.cursor()
    cursor.execute(
        """SELECT ai_report_text, ai_report_json, final_report_text, confidence_score, created_at
           FROM reports WHERE study_id = ? ORDER BY created_at DESC LIMIT 1""",
        (study_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    text = row[0]
    try:
        report_json = json.loads(row[1]) if row[1] else None
    except (TypeError, json.JSONDecodeError):
        report_json = None
    return {
        "report": row[2] if row[2] else text,
        "ai_report_text": text,
        "structured": report_json,
        "confidence_score": row[3],
        "created_at": row[4],
    }


# Initialize database on import
init_database()
