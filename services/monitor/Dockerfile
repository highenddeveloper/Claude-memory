FROM golang:1.22-alpine AS builder
WORKDIR /build
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o monitor .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates wget
COPY --from=builder /build/monitor /usr/local/bin/

ENV PORT=8001 CHECK_INTERVAL=30s
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8001/health || exit 1

CMD ["monitor"]
