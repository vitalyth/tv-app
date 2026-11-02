import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from models.schemas import Channel
from services.stream_service import get_stream


def radio(link_details):
    return Channel(
        id='rd_103', channelID='rd_103', index=12, name='103FM',
        module='radio', mode=11, type='radio', linkDetails=link_details,
    )


class RadioStreamResolutionTests(unittest.TestCase):
    @patch('services.stream_service.__import__', create=True)
    @patch('services.stream_service.get_custom_channel', return_value=None)
    def test_direct_station_stream_does_not_need_addon_resolution(self, custom, import_module):
        stream = 'https://cdn.example.com/103fm/icecast.audio'
        self.assertEqual(get_stream(radio({'link': stream, 'final': True})), stream)
        import_module.assert_not_called()

    @patch('services.stream_service.xbmcplugin.getStream', return_value='https://cdn.example.com/103fm/audio')
    @patch('services.stream_service.xbmcplugin.clearStream')
    @patch('services.stream_service.__import__', create=True)
    @patch('services.stream_service.get_custom_channel', return_value=None)
    def test_page_based_station_uses_addon_extraction(self, custom, import_module, clear_stream, get_stream_result):
        module = SimpleNamespace(Run=Mock())
        import_module.return_value = module
        channel = radio({'link': 'https://103fm.example.com/player', 'regex': 'data-file="(.*?)"'})
        self.assertEqual(get_stream(channel), 'https://cdn.example.com/103fm/audio')
        clear_stream.assert_called_once()
        module.Run.assert_called_once_with('103FM', 'rd_103', 11, '', '1')


if __name__ == '__main__':
    unittest.main()
