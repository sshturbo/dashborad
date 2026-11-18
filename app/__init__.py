import logging
import re
import sys
import time
import uuid
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import Flask, g, request

from app.config import Config
from app.routes.api import api_bp
from app.routes.main import main_bp


def create_app(test_config: dict | None = None) -> Flask:
    """Application factory used by development, tests and production servers."""
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)

    if test_config:
        app.config.update(test_config)

    _configure_logging(app)

    @app.before_request
    def begin_request_logging():
        supplied_id = request.headers.get("X-Request-ID", "")
        g.request_id = supplied_id if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", supplied_id) else uuid.uuid4().hex
        g.request_started_at = time.perf_counter()

    @app.after_request
    def finish_request_logging(response):
        request_id = getattr(g, "request_id", uuid.uuid4().hex)
        response.headers["X-Request-ID"] = request_id
        if not request.path.startswith("/static/"):
            elapsed_ms = round((time.perf_counter() - getattr(g, "request_started_at", time.perf_counter())) * 1000, 1)
            message = (
                "http_request request_id=%s method=%s path=%s status=%s duration_ms=%s content_length=%s"
            )
            log = app.logger.warning if response.status_code >= 400 else app.logger.info
            log(message, request_id, request.method, request.path, response.status_code, elapsed_ms, request.content_length or 0)
        return response

    @app.teardown_request
    def log_unhandled_request_error(error):
        if error is not None:
            app.logger.error(
                "request_exception request_id=%s method=%s path=%s exception=%s",
                getattr(g, "request_id", "-"),
                request.method,
                request.path,
                type(error).__name__,
                exc_info=(type(error), error, error.__traceback__),
            )

    upload_folder = Path(app.config["UPLOAD_FOLDER"])
    upload_folder.mkdir(parents=True, exist_ok=True)

    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix="/api")

    app.logger.info(
        "application_started debug=%s max_upload_bytes=%s",
        app.config["DEBUG"],
        app.config["MAX_CONTENT_LENGTH"],
    )

    return app


def _configure_logging(app: Flask) -> None:
    level_name = str(app.config.get("LOG_LEVEL", "INFO")).upper()
    level = getattr(logging, level_name, logging.INFO)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s", "%Y-%m-%d %H:%M:%S")

    app.logger.setLevel(level)
    app.logger.handlers.clear()
    app.logger.propagate = False

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    app.logger.addHandler(console_handler)

    log_file = Path(app.config["LOG_FILE"])
    try:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=5 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        app.logger.addHandler(file_handler)
    except OSError as error:
        app.logger.warning("log_file_unavailable path=%s error_type=%s", log_file, type(error).__name__)

