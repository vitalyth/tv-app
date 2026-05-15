import os
import tempfile

def translatePath(path):
    normalized = path.rstrip("/")

    if normalized == "special://temp":
        temp_path = os.path.join(tempfile.gettempdir(), "tv-app-kodi-temp")
        os.makedirs(temp_path, exist_ok=True)
        return temp_path

    if normalized.startswith("special://temp/"):
        temp_path = os.path.join(
            tempfile.gettempdir(),
            "tv-app-kodi-temp",
            normalized.removeprefix("special://temp/"),
        )
        os.makedirs(os.path.dirname(temp_path), exist_ok=True)
        return temp_path

    return os.path.abspath(path)

def exists(path):
    return os.path.exists(path)

def mkdir(path):
    os.makedirs(path, exist_ok=True)

class File:

    def __init__(self, path, mode="r"):
        self.file = open(path, mode)

    def read(self):
        return self.file.read()

    def write(self, data):
        self.file.write(data)

    def close(self):
        self.file.close()
