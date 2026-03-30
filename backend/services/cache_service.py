_stream_cache = {}

def get(channel_id):
    return _stream_cache.get(channel_id)

def set(channel_id, data):
    _stream_cache[channel_id] = data