# ─── Stage 1: Export model to ONNX ───
FROM python:3.11-slim AS model-prep
RUN pip install --no-cache-dir optimum[onnxruntime] sentence-transformers
RUN optimum-cli export onnx \
    --model sentence-transformers/all-MiniLM-L6-v2 \
    --task feature-extraction \
    /models/

# ─── Stage 2: Build Rust binary ───
FROM rust:1.78-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends cmake pkg-config && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY Cargo.toml ./
# Cache dependencies
RUN mkdir -p src && echo "fn main(){}" > src/main.rs && cargo build --release 2>/dev/null || true
COPY src/ src/
RUN touch src/main.rs && cargo build --release

# ─── Stage 3: Runtime ───
FROM debian:bookworm-slim

# Install ONNX Runtime (matches ort 2.0 load-dynamic)
ENV ORT_VERSION=1.17.3
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget libgomp1 && \
    wget -q -O /tmp/ort.tgz \
    "https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-x64-${ORT_VERSION}.tgz" && \
    tar xzf /tmp/ort.tgz -C /opt/ && \
    rm /tmp/ort.tgz && \
    apt-get remove -y wget && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

ENV ORT_DYLIB_PATH=/opt/onnxruntime-linux-x64-1.17.3/lib/libonnxruntime.so

COPY --from=model-prep /models/ /models/
COPY --from=builder /build/target/release/embedding-server /usr/local/bin/

ENV MODEL_DIR=/models PORT=8000 RUST_LOG=info
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8000/health || exit 1

CMD ["embedding-server"]
