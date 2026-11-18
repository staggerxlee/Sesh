FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DJANGO_DEBUG=0
WORKDIR /app
COPY requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt && useradd --create-home sesh
# Browsers can report legacy IANA aliases missing from slim system images.
RUN PYTHONTZPATH="" python -c "from zoneinfo import ZoneInfo; [ZoneInfo(z) for z in ('UTC', 'Asia/Kathmandu', 'Asia/Katmandu', 'Asia/Calcutta', 'America/New_York')]"
COPY . .
USER sesh
EXPOSE 8000
CMD ["sh", "start.sh"]
