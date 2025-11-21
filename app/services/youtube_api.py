from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

import requests

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"


class YoutubeClipFinder:
    """Small helper that searches descriptions referencing a given archive video."""

    def __init__(self, api_key: str, max_results: int = 25) -> None:
        if not api_key:
            raise ValueError("YOUTUBE_API_KEY is not configured.")
        self.api_key = api_key
        self.max_results = max_results
        self._session = requests.Session()

    def find_clips(self, original_url: str) -> Dict[str, Any]:
        video_id = extract_video_id(original_url)
        if not video_id:
            raise ValueError("動画IDをURLから抽出できませんでした。")

        original_info = self._fetch_original_metadata(video_id)
        patterns = build_description_patterns(video_id)
        search_items = self._search_candidates(video_id)
        candidate_ids = self._extract_video_ids(search_items)
        video_map = self._fetch_full_metadata(candidate_ids)
        results: List[Dict] = []
        for vid in candidate_ids:
            item = video_map.get(vid)
            if not item:
                continue
            description = item.get("snippet", {}).get("description", "") or ""
            if not any(pattern in description for pattern in patterns):
                continue
            snippet = item.get("snippet", {})
            statistics = item.get("statistics", {})
            content_details = item.get("contentDetails", {})
            duration_seconds = parse_iso8601_duration(content_details.get("duration"))
            is_short = is_short_video(duration_seconds)
            results.append(
                {
                    "videoId": vid,
                    "title": snippet.get("title"),
                    "channelTitle": snippet.get("channelTitle"),
                    "description": description,
                    "descriptionSnippet": create_description_snippet(description, patterns),
                    "url": f"https://www.youtube.com/watch?v={vid}",
                    "publishedAt": snippet.get("publishedAt"),
                    "thumbnailUrl": extract_thumbnail_url(snippet),
                    "viewCount": int(statistics.get("viewCount", 0) or 0),
                    "durationSeconds": duration_seconds,
                    "durationText": format_duration(duration_seconds),
                    "isShort": is_short,
                }
            )
        return {"original": original_info, "items": results}

    def _search_candidates(self, video_id: str) -> List[Dict]:
        params = {
            "key": self.api_key,
            "part": "snippet",
            "type": "video",
            "q": video_id,
            "maxResults": self.max_results,
        }
        resp = self._session.get(YOUTUBE_SEARCH_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return data.get("items", [])

    def _extract_video_ids(self, items: List[Dict]) -> List[str]:
        ids: List[str] = []
        for item in items:
            vid = (item.get("id") or {}).get("videoId")
            if vid:
                ids.append(vid)
        # Preserve order but remove duplicates
        return list(dict.fromkeys(ids))

    def _fetch_full_metadata(self, video_ids: List[str]) -> Dict[str, Dict]:
        if not video_ids:
            return {}
        params = {
            "key": self.api_key,
            "part": "snippet,statistics,contentDetails",
            "id": ",".join(video_ids),
            "maxResults": len(video_ids),
        }
        resp = self._session.get(YOUTUBE_VIDEOS_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        result: Dict[str, Dict] = {}
        for item in data.get("items", []):
            vid = item.get("id")
            if vid:
                result[vid] = item
        return result

    def _fetch_original_metadata(self, video_id: str) -> Optional[Dict[str, Any]]:
        metadata = self._fetch_full_metadata([video_id])
        item = metadata.get(video_id)
        if not item:
            return None
        snippet = item.get("snippet", {}) or {}
        statistics = item.get("statistics", {}) or {}
        content_details = item.get("contentDetails", {}) or {}
        duration_seconds = parse_iso8601_duration(content_details.get("duration"))
        return {
            "videoId": video_id,
            "title": snippet.get("title"),
            "channelTitle": snippet.get("channelTitle"),
            "publishedAt": snippet.get("publishedAt"),
            "thumbnailUrl": extract_thumbnail_url(snippet, order=("high", "medium", "default")),
            "viewCount": int(statistics.get("viewCount", 0) or 0),
            "durationSeconds": duration_seconds,
            "durationText": format_duration(duration_seconds),
            "url": f"https://www.youtube.com/watch?v={video_id}",
        }


def extract_video_id(value: str) -> Optional[str]:
    """Extracts a YouTube video ID from several URL formats or a raw ID."""
    if not value:
        return None
    value = value.strip()
    if re.fullmatch(r"[0-9A-Za-z_-]{6,}", value):
        return value

    parsed = urlparse(value)
    host = parsed.netloc.lower()
    path = parsed.path

    if host in {"youtu.be", "www.youtu.be"}:
        vid = path.lstrip("/").split("/", 1)[0]
        return vid or None

    if host.endswith("youtube.com"):
        qs = parse_qs(parsed.query)
        if "v" in qs:
            return qs["v"][0]
        match = re.match(r"^/(?:embed|shorts|live)/([0-9A-Za-z_-]{6,})", path)
        if match:
            return match.group(1)
        if path.startswith("/watch/"):
            # Mobile app sometimes shares /watch/<id>
            candidate = path.split("/")[2] if len(path.split("/")) > 2 else ""
            if re.fullmatch(r"[0-9A-Za-z_-]{6,}", candidate):
                return candidate
    return None


def build_description_patterns(video_id: str) -> List[str]:
    return [
        video_id,
        f"https://www.youtube.com/watch?v={video_id}",
        f"https://youtu.be/{video_id}",
    ]


def create_description_snippet(description: str, patterns: List[str], window: int = 80) -> str:
    lower_desc = description.lower()
    for pattern in patterns:
        idx = lower_desc.find(pattern.lower())
        if idx >= 0:
            start = max(0, idx - window // 2)
            end = min(len(description), idx + len(pattern) + window // 2)
            snippet = description[start:end]
            return snippet.replace("\n", " ")
    return description[:window].replace("\n", " ")


def parse_iso8601_duration(duration: Optional[str]) -> Optional[int]:
    if not duration:
        return None
    pattern = re.compile(
        r"PT"
        r"(?:(?P<hours>\d+)H)?"
        r"(?:(?P<minutes>\d+)M)?"
        r"(?:(?P<seconds>\d+)S)?"
    )
    match = pattern.fullmatch(duration)
    if not match:
        return None
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    seconds = int(match.group("seconds") or 0)
    return hours * 3600 + minutes * 60 + seconds


def format_duration(value: Optional[int]) -> Optional[str]:
    if value is None:
        return None
    hours, remainder = divmod(value, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def is_short_video(duration_seconds: Optional[int]) -> bool:
    if duration_seconds is None:
        return False
    return duration_seconds <= 60


def extract_thumbnail_url(snippet: Dict, order: tuple[str, ...] = ("medium", "high", "default")) -> Optional[str]:
    thumbnails = snippet.get("thumbnails") or {}
    for key in order:
        target = thumbnails.get(key) or {}
        url = target.get("url")
        if url:
            return url
    return None
