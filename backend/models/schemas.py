from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class Program(BaseModel):
    start: int
    end: int
    name: str
    description: str
    image: Optional[str] = None

class Channel(BaseModel):
    id: Optional[str] = None
    index: int
    name: str
    logo: Optional[str] = None
    category: Optional[str] = None
    linkDetails: Optional[Dict[str, Any]] = None
    module: str
    channelID: Optional[str] = None
    mode: int
    type: Optional[str] = None
    programs: Optional[List["Program"]] = None
    tvgID: Optional[str] = None
    channelNumber: Optional[str] = None
