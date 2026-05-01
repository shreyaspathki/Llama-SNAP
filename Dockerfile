# Use an official Python runtime with CUDA support if needed,
# or just slim if you rely on volume mapping the huge torch libs or cpu-only inference in container.
# For simplicity and GPU passthrough, we'll start with slim and install torch.
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy gateway requirements
COPY gateway/requirements.txt ./gateway/requirements.txt

# Install Python dependencies
# Update pip first
RUN pip install --upgrade pip

# Install dependencies
RUN pip install --no-cache-dir -r gateway/requirements.txt

# Copy source code
COPY . .

# Expose the API port
EXPOSE 8000

# Run the application
# We use the python module syntax to run the app from the root /app
# This ensures imports like 'from gateway.app...' or relative imports work if configured that way.
# Given the improved structure, we'll run uvicorn on the app object.
CMD ["uvicorn", "gateway.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
