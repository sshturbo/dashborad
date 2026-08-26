from pathlib import Path

from flask import Flask

from app.config import Config
from app.routes.api import api_bp
from app.routes.main import main_bp


def create_app(test_config: dict | None = None) -> Flask:
    """Application factory used by development, tests and production servers."""
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)

    if test_config:
        app.config.update(test_config)

    upload_folder = Path(app.config["UPLOAD_FOLDER"])
    upload_folder.mkdir(parents=True, exist_ok=True)

    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix="/api")

    return app

