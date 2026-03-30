from pydantic import BaseModel
from typing import Dict, Any

class Program(BaseModel):
    start: int
    end: int
    name: str
    description: str

class Channel(BaseModel):
    id: str
    index: int
    name: str
    logo: str
    category: str
    linkDetails: Dict[str, Any]
    module: str
    channelID: str
    mode: int
    type: str
    programs: list[Program]