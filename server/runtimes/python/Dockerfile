FROM python:3.12-alpine

# Prevent Python from writing .pyc files and enable unbuffered output for lower runtime overhead
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Create unprivileged sandbox user and clean package caches
RUN adduser -D -u 1000 user && \
    rm -rf /var/cache/apk/* /root/.cache

USER user
WORKDIR /app
