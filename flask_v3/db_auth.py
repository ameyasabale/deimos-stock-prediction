import pyodbc
from flask import request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

CONN_STR_NSE = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=AmeyaFX_NSE;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)


def signup_user():
    data = request.get_json() or {}
    full_name = (data.get("fullName") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not full_name or not email or not password:
        return jsonify({"success": False, "error": "fullName, email, password are required"}), 400
    if len(password) < 6:
        return jsonify({"success": False, "error": "Password must be at least 6 characters"}), 400

    try:
        conn = pyodbc.connect(CONN_STR_NSE)
        cursor = conn.cursor()

        cursor.execute("SELECT UserID FROM Users WHERE Email = ?", email)
        if cursor.fetchone():
            conn.close()
            return jsonify({"success": False, "error": "Email already registered"}), 409

        password_hash = generate_password_hash(password)
        cursor.execute(
            """
            INSERT INTO Users (FullName, Email, PasswordHash)
            VALUES (?, ?, ?)
            """,
            full_name,
            email,
            password_hash,
        )
        conn.commit()

        cursor.execute("SELECT TOP 1 UserID, FullName, Email, CreatedAt FROM Users WHERE Email = ?", email)
        row = cursor.fetchone()
        conn.close()

        return jsonify(
            {
                "success": True,
                "user": {
                    "userId": int(row.UserID),
                    "fullName": row.FullName,
                    "email": row.Email,
                    "createdAt": str(row.CreatedAt),
                },
            }
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def login_user():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"success": False, "error": "email and password are required"}), 400

    try:
        conn = pyodbc.connect(CONN_STR_NSE)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT TOP 1 UserID, FullName, Email, PasswordHash, CreatedAt
            FROM Users
            WHERE Email = ?
            """,
            email,
        )
        row = cursor.fetchone()
        conn.close()

        if not row or not check_password_hash(row.PasswordHash, password):
            return jsonify({"success": False, "error": "Invalid email or password"}), 401

        return jsonify(
            {
                "success": True,
                "user": {
                    "userId": int(row.UserID),
                    "fullName": row.FullName,
                    "email": row.Email,
                    "createdAt": str(row.CreatedAt),
                },
            }
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
