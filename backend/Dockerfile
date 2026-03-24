FROM python:3.11-slim

WORKDIR /app

COPY . .

ENV PYTHONPATH=/app:/app/plugin_video_idanplus:/app/debug

RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]