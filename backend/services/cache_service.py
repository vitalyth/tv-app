from datetime import datetime, timedelta

_stream_cache = {}  # {channel_id: {data, expires_at}}
CACHE_TTL = timedelta(minutes=30)  # Cache expires after 30 minutes

def get(channel_id):
    """Get cached data if not expired"""
    cached = _stream_cache.get(channel_id)
    if cached and cached['expires_at'] > datetime.now():
        return cached['data']
    # Expired or not found - clean up
    if channel_id in _stream_cache:
        del _stream_cache[channel_id]
    return None

def set(channel_id, data):
    """Store data with expiration time"""
    _stream_cache[channel_id] = {
        'data': data,
        'expires_at': datetime.now() + CACHE_TTL
    }