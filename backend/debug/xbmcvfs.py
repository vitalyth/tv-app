import os

def translatePath(path):
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