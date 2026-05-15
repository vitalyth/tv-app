import os

class Addon:

    def __init__(self, id=None):

        self.base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        self.settings = {
            "favSortBy": "0",
            "channelNameFormat": 1,
            "programNameFormat": "0",
            "makoSortBy": "0",
            "keshet_res": "auto",
            "makoUsername": "",
            "makoPassword": "",
            "makoShowShortSubtitle": "false",
            "tvShortcut": 'true',
            "useIPTV": 'true',
        }

        self.settingString = {}

        po_path = os.path.join(
            self.base_path,
            "resources",
            "language",
            "resource.language.en_gb",
            "strings.po"
        )

        self.localized = {}

        if os.path.exists(po_path):
            with open(po_path, "r", encoding="utf-8") as f:
                current_id = None
                msgid = None

                for line in f:
                    line = line.strip()

                    if line.startswith("msgctxt"):
                        current_id = int(line.split("#")[1].replace('"', ""))

                    elif line.startswith("msgid"):
                        msgid = line.split("msgid",1)[1].strip().strip('"')

                    elif line.startswith("msgstr"):
                        msgstr = line.split("msgstr",1)[1].strip().strip('"')

                        value = msgstr if msgstr else msgid

                        if current_id is not None:
                            self.localized[current_id] = value

                        current_id = None
                        msgid = None


    def getSetting(self, key):
        return str(self.settings.get(key, "1"))

    def setSetting(self, key, value):
        self.settings[key] = value

    def setSettingString(self, id, value):
        self.settingString[id] = value

    def setSettingBool(self, id, value):
        #self.settingString[id] = value
        pass

    def getAddonInfo(self, key):

        data = {
            "icon": os.path.join(self.base_path, "icon.png"),
            "fanart": os.path.join(self.base_path, "fanart.jpg"),
            "name": "Debug Addon",
            "version": "1.0",
            "path": self.base_path,
            "profile": os.path.join(self.base_path, "profile")
        }

        return data.get(key, "")


    def getLocalizedString(self, id):
        return self.localized.get(id, f"STRING_{id}")


    def getSettingBool(self, id):
        value = self.getSetting(id)
        return str(value).lower() == "true"


    def getSettingString(self, id):
        return str(self.getSetting(id))


    def getSettingInt(self, id):
        try:
            return int(self.getSetting(id))
        except:
            return 0
