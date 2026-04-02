import requests
import xmltodict
from datetime import datetime, timedelta, timezone
from typing import Optional
import threading
import html
from plugin_video_idanplus.resources.lib import epg

def get_epg():
    r = requests.get("https://iptv-epg.org/files/epg-il.xml")
    
    data = xmltodict.parse(r.text)

    programmes = data["tv"]["programme"]

    result = [
        {
            "channel": p.get("@channel"),
            "title": p.get("title", {}).get("#text") if isinstance(p.get("title"), dict) else None,
            "start": p.get("@start"),
            "end": p.get("@stop"),
        }
        for p in programmes
    ]

    return result


class EPGService:
    def __init__(self, ttl_seconds: int = 3600):
        self.ttl = timedelta(seconds=ttl_seconds)
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
        xml_parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv>']

        for channel_id, programs in data.items():
            if not programs:
                continue

            # channel
            xml_parts.append(f'<channel id="{channel_id}">')
            xml_parts.append(f'<display-name>{html.escape(str(channel_id))}</display-name>')
            xml_parts.append('</channel>')

            # programmes
            for p in programs:
                start = self._unix_to_xmltv(p["start"])
                end = self._unix_to_xmltv(p["end"])
                title = html.escape(p.get("name", ""))
                desc = html.escape(p.get("description", ""))

                xml_parts.append(
                    f'<programme start="{start}" stop="{end}" channel="{channel_id}">'
                )
                xml_parts.append(f'<title>{title}</title>')
                xml_parts.append(f'<desc>{desc}</desc>')
                xml_parts.append('</programme>')

        xml_parts.append('</tv>')
        return "\n".join(xml_parts)

    def get_epg_xml(self) -> str:
        if self._is_cache_valid():
            return self._cache_xml

        with self._lock:
            if self._is_cache_valid():
                return self._cache_xml

            # fetch data
            data = epg.GetEPG(deltaInSec=3 * 86400)

            # build xml
            xml = self._build_epg_xml(data)

            # cache
            self._cache_xml = xml
            self._last_update = datetime.utcnow()

            return xml