FROM alpine:3.19

# Install GCC/G++ and Musl development libraries; omit unused build utilities (e.g. make)
RUN apk add --no-cache g++ gcc musl-dev && \
    rm -rf /var/cache/apk/* /tmp/*

RUN adduser -D -u 1000 user
USER user
WORKDIR /app
