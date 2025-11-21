from __future__ import annotations

from datetime import datetime
from typing import Dict, List

from flask import Blueprint, Flask, current_app, jsonify, render_template, request

from .services.youtube_api import YoutubeClipFinder, parse_iso_datetime


SORTERS = {
    "views": lambda item: int(item.get("viewCount", 0) or 0),
    "date": lambda item: parse_iso_datetime(item.get("publishedAt")) or datetime.min,
    "duration": lambda item: int(item.get("durationSeconds") or 0),
}


def register_routes(app: Flask) -> None:
    bp = Blueprint("main", __name__)

    @bp.get("/")
    def index():
        return render_template("index.html")

    @bp.get("/api/search")
    def search():
        archive_url = (request.args.get("url") or "").strip()
        sort_by = (request.args.get("sort") or "views").lower()
        order = (request.args.get("order") or "desc").lower()

        if not archive_url:
            return jsonify({"error": "URL is required"}), 400
        if sort_by not in SORTERS:
            return jsonify({"error": "Invalid sort type"}), 400
        if order not in {"asc", "desc"}:
            return jsonify({"error": "Invalid order"}), 400

        try:
            finder = _build_finder()
            payload = finder.find_clips(archive_url)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:  # pylint: disable=broad-except
            return jsonify({"error": "検索中にエラーが発生しました。"}), 500

        items = payload.get("items", [])
        original = payload.get("original")
        sorted_items = _sort_results(items, sort_by, order)
        return jsonify({
            "items": sorted_items,
            "count": len(sorted_items),
            "sort": sort_by,
            "order": order,
            "original": original,
        })

    app.register_blueprint(bp)


def _build_finder() -> YoutubeClipFinder:
    cfg = current_app.config
    youtube_cfg = cfg.get("YOUTUBE", {})
    search_cfg = cfg.get("SEARCH", {})
    return YoutubeClipFinder(
        api_key=youtube_cfg.get("api_key"),
        max_results=int(search_cfg.get("max_results", 25)),
    )


def _sort_results(items: List[Dict], sort_by: str, order: str) -> List[Dict]:
    key_fn = SORTERS.get(sort_by, SORTERS["views"])
    reverse = order == "desc"
    return sorted(items, key=key_fn, reverse=reverse)
