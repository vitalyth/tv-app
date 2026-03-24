import urllib.parse
import questionary

class VideoInfoTag:

    def setTitle(self, title):
        pass

    def setPlot(self, plot):
        pass

    def setYear(self, year):
        pass

    def setMediaType(self, type):
        pass

    def setMpaa(self, value):
        pass


class ListItem:

    def __init__(self, label="", label2="", path="", **kwargs):
        self.label = label
        self.label2 = label2
        self.path = path

    def getLabel(self):
        return self.label

    def setInfo(self, type, infoLabels):
        pass

    def setArt(self, art):
        pass

    def setProperty(self, isPlayable, value):
        pass

    def getVideoInfoTag(self):
        return VideoInfoTag()

    def addContextMenuItems(self, items):
        #print('====addContextMenuItems====', items)

        #channels = []
        
        #for item in items:
            #print('====item====', item)
            #channels.append(label)

        #action = questionary.select('Choose Channel', channels).ask()

        # print(channels)
        
        """
        print("\n📋 CONTEXT MENU")
        print("────────────────────────")

        menu = []
        actions = {}

        for label, action in items:

            if action.startswith("RunPlugin("):

                plugin_url = action[len("RunPlugin("):-1]
                plugin_url = urllib.parse.unquote(plugin_url)

                parsed = urllib.parse.urlparse(plugin_url)
                params = urllib.parse.parse_qs(parsed.query)

                url_value = params.get("url", [""])[0]
                url_value = urllib.parse.unquote(url_value)

                text = f"{label}  →  {url_value}"

                menu.append(text)
                actions[text] = plugin_url

        if not menu:
            return

        choice = questionary.select(
            "בחר פעולה",
            choices=menu
        ).ask()

        if not choice:
            return

        selected = actions[choice]

        print("\n▶ Selected URL")
        print(selected)
        print("────────────────────────\n")

        #return selected
        """