FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV NEW_CITY_ENV=production
ENV HOST=0.0.0.0

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --shell /bin/sh appuser
RUN mkdir -p /app/data
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["python", "run.py"]
