FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

EXPOSE 8090
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
