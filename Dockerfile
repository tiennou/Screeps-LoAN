FROM python:3.11-slim

LABEL maintainer="Screeps LoAN"
LABEL version="1.0"
LABEL description="Screeps League of Automated Nations"

ENV FLASK_APP=screeps_loan/screeps_loan.py
ENV FLASK_RUN_CERT=adhoc
ENV GUNICORN_WORKERS=3
ENV GUNICORN_BIND=0.0.0.0:5000

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip certifi
RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chown -R appuser:appuser /app
USER appuser
CMD ["sh", "-c", "gunicorn -w $GUNICORN_WORKERS -b $GUNICORN_BIND screeps_loan.screeps_loan:app"]