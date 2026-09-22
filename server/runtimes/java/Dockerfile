FROM eclipse-temurin:17-jdk-alpine

# Pre-generate AppCDS shared class archive for fast JVM initialization
RUN java -Xshare:dump 2>/dev/null || true

# Strip unused development artifacts (source zip, man pages, demo suites)
RUN rm -rf /opt/java/openjdk/lib/src.zip \
           /opt/java/openjdk/man \
           /opt/java/openjdk/demo \
           /var/cache/apk/* /tmp/*

RUN adduser -D -u 1000 user
USER user
WORKDIR /app
