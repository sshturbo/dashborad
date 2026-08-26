import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")
    DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH_MB", "16")) * 1024 * 1024
    MAX_DATASET_ROWS = int(os.getenv("MAX_DATASET_ROWS", "100000"))
    UPLOAD_FOLDER = BASE_DIR / "instance" / "uploads"
    ALLOWED_EXTENSIONS = {"xls", "xlsx"}
    JSON_SORT_KEYS = False

