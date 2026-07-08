FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLEET_STORE_BACKEND=json \
    FLEET_DATA_DIR=/data \
    FLEET_SERVE_APP=1 \
    FLEET_APP_DIR=/app

WORKDIR /app

COPY backend/requirements-container.txt /app/backend/requirements-container.txt
RUN pip install --no-cache-dir -r /app/backend/requirements-container.txt

COPY backend /app/backend
COPY index.html styles.css coc-data-map.js api.php /app/
COPY app-*.js /app/

RUN mkdir -p /data

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001"]
