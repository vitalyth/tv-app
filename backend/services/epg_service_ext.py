from datetime import datetime, timedelta, timezone
import threading
from typing import Callable, Optional
from xml.etree import ElementTree


def _load_guide_epg() -> dict:
    from services.epg_service import get_now_epg

    return get_now_epg()


class EPGService:
    def __init__(self, ttl_seconds: int = 3600, data_loader: Callable[[], dict] = _load_guide_epg):
        self.ttl = timedelta(seconds=ttl_seconds)
        self._data_loader = data_loader
        self._cache_xml: Optional[str] = None
        self._last_update: Optional[datetime] = None
        self._lock = threading.Lock()

    def _is_cache_valid(self) -> bool:
        if not self._cache_xml or not self._last_update:
            return False
        return datetime.utcnow() - self._last_update < self.ttl

    def _unix_to_xmltv(self, ts: int) -> str:
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        return dt.strftime("%Y%m%d%H%M%S +0000")

    def _build_epg_xml(self, data: dict) -> str:
        tv = ElementTree.Element("tv")

        for channel_id, programs in data.items():
            if not programs:
                continue

            channel_id = str(channel_id)
            channel = ElementTree.SubElement(tv, "channel", {"id": channel_id})
            ElementTree.SubElement(channel, "display-name").text = channel_id

            for p in programs:
                start = self._unix_to_xmltv(p["start"])
                end = self._unix_to_xmltv(p["end"])
                programme = ElementTree.SubElement(
                    tv,
                    "programme",
                    {"start": start, "stop": end, "channel": channel_id},
                )
                ElementTree.SubElement(programme, "title").text = str(p.get("name") or "")
                ElementTree.SubElement(programme, "desc").text = str(p.get("description") or "")
                image = p.get("image")
                if isinstance(image, str) and image.strip():
                    ElementTree.SubElement(programme, "icon", {"src": image.strip()})

        return ElementTree.tostring(tv, encoding="utf-8", xml_declaration=True).decode("utf-8")

    def get_epg_xml(self) -> str:
        if self._is_cache_valid():
            return self._cache_xml

        with self._lock:
            if self._is_cache_valid():
                return self._cache_xml

            data = self._data_loader()

            xml = self._build_epg_xml(data)

            self._cache_xml = xml
            self._last_update = datetime.utcnow()

            return xml
