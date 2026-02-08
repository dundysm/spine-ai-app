"""Quick script to check DB state and optionally set a study to 'received' for testing."""
import sqlite3
import sys
from pathlib import Path

DATABASE_PATH = Path(__file__).resolve().parent / "spine_studies.db"
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"

def main():
    if not DATABASE_PATH.exists():
        print("No database yet. Run the app or orthanc_monitor first.")
        return
    conn = sqlite3.connect(str(DATABASE_PATH))
    cur = conn.cursor()
    cur.execute("SELECT study_id, status, received_at FROM studies ORDER BY received_at DESC")
    rows = cur.fetchall()
    print("Studies in DB:")
    for r in rows:
        print(f"  {r[0][:40]}...  status={r[1]}  {r[2]}")
    cur.execute("SELECT study_id FROM studies WHERE status = 'received'")
    received = [r[0] for r in cur.fetchall()]
    print(f"\nReceived (pending analysis): {len(received)}")
    if "reset" in sys.argv and rows:
        # Reset first study that has uploads to 'received'
        for r in rows:
            sid = r[0]
            if (UPLOADS_DIR / sid).is_dir():
                cur.execute("UPDATE studies SET status = 'received', analyzed_at = NULL, error_message = NULL WHERE study_id = ?", (sid,))
                conn.commit()
                print(f"\nReset {sid[:40]}... to status='received' for testing.")
                break
    conn.close()

if __name__ == "__main__":
    main()
