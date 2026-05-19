from constants import Color
import zipfile
import re
import time

LOGDEBUG = 0
LOGINFO = 1
LOGWARNING = 2
LOGERROR = 3
LOGFATAL = 4


def log(msg, level=LOGINFO):
    print("LOG:", msg)


def getInfoLabel(label):
    if label == "System.BuildVersion":
        return "20.0"
    return ""


def sleep(milliseconds):
    time.sleep(milliseconds / 1000)


def executebuiltin(cmd, *args):
    print(f"{Color.YELLOW}[XBMC BUILTIN] {cmd}{Color.RESET}")

    if cmd.startswith("Extract("):
        match = re.match(r'Extract\((.*?),\s*(.*?)\)', cmd)
        if not match:
            print("Invalid Extract command format")
            return

        zip_path = match.group(1).strip().strip('"').strip("'")
        dest_path = match.group(2).strip().strip('"').strip("'")

        try:
            print(f"Extracting {zip_path} -> {dest_path}")

            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(dest_path)

            print("✅ Extraction completed")

        except Exception as e:
            print(f"Extraction failed: {e}")