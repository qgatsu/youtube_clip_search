from flask import Flask

from .config import load_app_config
from .routes import register_routes


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.update(load_app_config())
    register_routes(app)
    return app
