# Build the web page, then run the API server (which also serves web/dist), plus the pinned Linux pingcli for Real mode.
# pingcli is downloaded from the pingidentity/pingcli GitHub release and checked against a pinned sha256
# (from the release's ppds-pingcli_<version>_checksums.txt), so a changed binary fails the build.
FROM node:26-alpine AS pingcli
ARG TARGETARCH
ARG PINGCLI_VERSION=1.2.0
ARG PINGCLI_SHA256_AMD64=30333efbfdd2f7fb00ee4fdc5766574967c0bed9f2ea244841b5e965cc3ede44
ARG PINGCLI_SHA256_ARM64=f06f90b8360ab9a4981c4107ac51321d22b2af826ce1998f230d2db29546f288
RUN set -eu; \
    case "${TARGETARCH:-amd64}" in amd64) sum="$PINGCLI_SHA256_AMD64";; arm64) sum="$PINGCLI_SHA256_ARM64";; *) echo "unsupported arch ${TARGETARCH}"; exit 1;; esac; \
    wget -q -O /tmp/pingcli "https://github.com/pingidentity/pingcli/releases/download/v${PINGCLI_VERSION}/pingcli_${PINGCLI_VERSION}_linux_${TARGETARCH:-amd64}"; \
    echo "$sum  /tmp/pingcli" | sha256sum -c -; \
    install -m 0755 /tmp/pingcli /usr/local/bin/pingcli

FROM node:26-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci
COPY web web
# The page imports the shared, dependency-free readable.js (Easy read table/form and JSON tokens).
COPY server/src/readable.js server/src/readable.js
RUN npm run build -w web

FROM node:26-alpine
WORKDIR /app
# MODE is empty: Real when the PINGONE_* settings are passed in and usable, else Mock.
ENV NODE_ENV=production PORT=7806 MODE=
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server/src server/src
COPY server/diagrams server/diagrams
COPY --from=web /app/web/dist web/dist
COPY --from=pingcli /usr/local/bin/pingcli /usr/local/bin/pingcli
USER node
EXPOSE 7806
# Inside the container the server must listen on all interfaces, so PINGCLI_BIND is set here on purpose.
# The compose file publishes the port on 127.0.0.1 only; do not publish it more widely.
ENV PINGCLI_BIND=0.0.0.0
CMD ["node", "server/src/index.js"]
