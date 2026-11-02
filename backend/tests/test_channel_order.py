import unittest
from unittest.mock import patch

from services.custom_channel_service import merge_custom_channels, order_channels


class ChannelOrderTests(unittest.TestCase):
    def test_display_order_is_independent_of_source_groups_and_channel_numbers(self):
        channels = [
            {'channelID': 'backup', 'index': 1, 'channelNumber': '11'},
            {'channelID': 'primary', 'index': 1, 'channelNumber': '11'},
            {'channelID': 'other', 'index': 2, 'channelNumber': '12'},
        ]
        result = order_channels(channels, [
            {'channelID': 'primary', 'orderNumber': 10},
            {'channelID': 'backup', 'orderNumber': 20},
            {'channelID': 'other', 'orderNumber': 30},
        ])
        self.assertEqual([c['channelID'] for c in result], ['primary', 'backup', 'other'])
        self.assertEqual([c['index'] for c in result], [1, 1, 2])
        self.assertEqual([c['channelNumber'] for c in result], ['11', '11', '12'])
        self.assertTrue(all('orderNumber' not in c for c in channels))

    def test_unconfigured_channels_get_an_order_after_configured_channels(self):
        channels = [{'id': 'new'}, {'id': 'known'}, {'id': 'another'}]
        result = order_channels(channels, [{'id': 'known', 'orderNumber': 50}])
        self.assertEqual([c['id'] for c in result], ['known', 'new', 'another'])
        self.assertEqual([c['orderNumber'] for c in result], [50, 60, 70])
        self.assertEqual(order_channels(result, []), result)

    @patch('services.custom_channel_service.load_custom_channels')
    def test_order_override_does_not_create_a_missing_or_hidden_channel(self, load):
        load.return_value = [
            {'id': 'missing', 'channelID': 'missing', 'orderNumber': 10},
            {'id': 'existing', 'channelID': 'existing', 'orderNumber': 20},
        ]
        result = merge_custom_channels([{'channelID': 'existing', 'index': 1, 'type': 'tv'}])
        self.assertEqual([c['channelID'] for c in result], ['existing'])
        self.assertEqual(result[0]['orderNumber'], 20)


if __name__ == '__main__':
    unittest.main()
