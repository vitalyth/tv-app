import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def create_session(total_retries=3, pool_maxsize=10):
    session = requests.Session()

    retries = Retry(
        total=total_retries,
        backoff_factor=0.3,
        status_forcelist=[500, 502, 503, 504],
    )

    session.mount("https://", HTTPAdapter(max_retries=retries, pool_maxsize=pool_maxsize))
    session.mount("http://", HTTPAdapter(max_retries=retries, pool_maxsize=pool_maxsize))

    return session
