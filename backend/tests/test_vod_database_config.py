import os
import unittest
from unittest.mock import patch

from config import get_vod_db_path


class VodDatabaseConfigTests(unittest.TestCase):
    def test_shared_path_is_used_by_default_and_takes_priority_over_legacy(self):
        with patch.dict(os.environ, {'VOD_DB_PATH': '/shared/vod.db', 'KAN_VOD_DB_PATH': '/old/kan.db'}, clear=True):
            self.assertEqual(get_vod_db_path(), '/shared/vod.db')
            self.assertEqual(get_vod_db_path('KESHET_VOD_DB_PATH', 'KESHT_VOD_DB_PATH'), '/shared/vod.db')
            for provider in ['C14', 'RESHET', 'I24']:
                self.assertEqual(get_vod_db_path(f'{provider}_VOD_DB_PATH'), '/shared/vod.db')

    def test_provider_override_and_keshet_alias_are_retained(self):
        for name in ['KESHET_VOD_DB_PATH', 'KESHT_VOD_DB_PATH', 'C14_VOD_DB_PATH', 'RESHET_VOD_DB_PATH', 'I24_VOD_DB_PATH']:
            with self.subTest(name=name), patch.dict(os.environ, {'VOD_DB_PATH': '/shared/vod.db', name: '/provider.db'}, clear=True):
                self.assertEqual(get_vod_db_path(name), '/provider.db')
        with patch.dict(os.environ, {'KESHET_VOD_DB_PATH': '/new.db', 'KESHT_VOD_DB_PATH': '/alias.db'}, clear=True):
            self.assertEqual(get_vod_db_path('KESHET_VOD_DB_PATH', 'KESHT_VOD_DB_PATH'), '/new.db')

    def test_legacy_local_deployments_and_unset_config_keep_their_paths(self):
        with patch.dict(os.environ, {'KAN_VOD_DB_PATH': '/local/kan.db'}, clear=True):
            self.assertEqual(get_vod_db_path('KESHET_VOD_DB_PATH'), '/local/kan.db')
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(get_vod_db_path(), 'db/kan_vod.db')
        with patch.dict(os.environ, {'VOD_DB_PATH': ' ', 'KESHET_VOD_DB_PATH': ''}, clear=True):
            self.assertEqual(get_vod_db_path('KESHET_VOD_DB_PATH'), 'db/kan_vod.db')
