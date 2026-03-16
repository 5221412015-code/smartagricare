FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app.py .
COPY crop_disease_data.json .
COPY best_swin_crop_disease.pth .

# HF Spaces expects port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["python", "app.py"]
