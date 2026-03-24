import sys
import os
import xbmcaddon
import importlib.util

# תיקיית הפרויקט (מעל debug)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# נתיב ל-addon
ADDON_DIR = os.path.join(BASE_DIR, "plugin.video.idanplus")

# מוסיף ל-python path
sys.path.insert(0, ADDON_DIR)

# יצירת Addon
addon = xbmcaddon.Addon()

# יצירת תיקיית profile כמו Kodi
os.makedirs(addon.getAddonInfo("profile"), exist_ok=True)

sys.argv = [
    "plugin://plugin.video.test",
    "1",
    "?mode=1",
]

# טעינת default.py מה-addon
default_path = os.path.join(ADDON_DIR, "default.py")

spec = importlib.util.spec_from_file_location("default", default_path)
default = importlib.util.module_from_spec(spec)
spec.loader.exec_module(default)