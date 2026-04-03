use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use ndarray::Array2;
use ort::{GraphOptimizationLevel, Session};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokenizers::Tokenizer;
use tower_http::cors::CorsLayer;
use tracing::info;

const EMBEDDING_DIM: usize = 384;
const MAX_SEQ_LEN: usize = 128;
const MAX_BATCH: usize = 64;

struct AppState {
    session: Session,
    tokenizer: Tokenizer,
}

// ─── Request / Response types ───

#[derive(Deserialize)]
struct EmbedRequest {
    texts: Vec<String>,
}

#[derive(Serialize)]
struct EmbedResponse {
    vectors: Vec<Vec<f32>>,
    dimensions: usize,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    model: String,
    dimensions: usize,
}

type AppError = (StatusCode, String);

fn internal_err(msg: impl std::fmt::Display) -> AppError {
    (StatusCode::INTERNAL_SERVER_ERROR, msg.to_string())
}

// ─── Handlers ───

async fn health(State(_): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        model: "all-MiniLM-L6-v2".into(),
        dimensions: EMBEDDING_DIM,
    })
}

async fn embed(
    State(state): State<Arc<AppState>>,
    Json(req): Json<EmbedRequest>,
) -> Result<Json<EmbedResponse>, AppError> {
    if req.texts.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No texts provided".into()));
    }
    if req.texts.len() > MAX_BATCH {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Max {} texts per batch", MAX_BATCH),
        ));
    }

    let batch_size = req.texts.len();

    // Tokenize all texts
    let encodings: Vec<_> = req
        .texts
        .iter()
        .map(|t| {
            state
                .tokenizer
                .encode(t.as_str(), true)
                .map_err(|e| internal_err(format!("Tokenization error: {}", e)))
        })
        .collect::<Result<_, _>>()?;

    // Calculate padded sequence length (capped at MAX_SEQ_LEN)
    let seq_len = encodings
        .iter()
        .map(|e| e.get_ids().len().min(MAX_SEQ_LEN))
        .max()
        .unwrap_or(1);

    // Build flat input tensors — ONNX expects [batch, seq_len] of i64
    let total = batch_size * seq_len;
    let mut input_ids = vec![0i64; total];
    let mut attn_mask = vec![0i64; total];
    let mut type_ids = vec![0i64; total];

    for (i, enc) in encodings.iter().enumerate() {
        let len = enc.get_ids().len().min(seq_len);
        let offset = i * seq_len;
        for j in 0..len {
            input_ids[offset + j] = enc.get_ids()[j] as i64;
            attn_mask[offset + j] = enc.get_attention_mask()[j] as i64;
            type_ids[offset + j] = enc.get_type_ids()[j] as i64;
        }
    }

    // Reshape into ndarray for ONNX Runtime
    let ids_arr =
        Array2::from_shape_vec((batch_size, seq_len), input_ids).map_err(|e| internal_err(e))?;
    let mask_arr = Array2::from_shape_vec((batch_size, seq_len), attn_mask.clone())
        .map_err(|e| internal_err(e))?;
    let types_arr =
        Array2::from_shape_vec((batch_size, seq_len), type_ids).map_err(|e| internal_err(e))?;

    // Run ONNX inference
    let outputs = state
        .session
        .run(
            ort::inputs![
                "input_ids" => ids_arr,
                "attention_mask" => mask_arr,
                "token_type_ids" => types_arr,
            ]
            .map_err(|e| internal_err(e))?,
        )
        .map_err(|e| internal_err(format!("Inference error: {}", e)))?;

    // Extract hidden states tensor — shape [batch, seq_len, 384]
    let hidden = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| internal_err(format!("Output extraction error: {}", e)))?;
    let h = hidden
        .as_slice()
        .ok_or_else(|| internal_err("Non-contiguous tensor output"))?;

    // Mean pooling with attention mask + L2 normalization
    let mut vectors = Vec::with_capacity(batch_size);
    for i in 0..batch_size {
        let mut emb = vec![0.0f32; EMBEDDING_DIM];
        let mut token_count = 0.0f32;

        for j in 0..seq_len {
            if attn_mask[i * seq_len + j] > 0 {
                let base = (i * seq_len + j) * EMBEDDING_DIM;
                for k in 0..EMBEDDING_DIM {
                    emb[k] += h[base + k];
                }
                token_count += 1.0;
            }
        }

        if token_count > 0.0 {
            for v in emb.iter_mut() {
                *v /= token_count;
            }
        }

        // L2 normalize
        let norm = emb.iter().map(|v| v * v).sum::<f32>().sqrt();
        if norm > 1e-12 {
            for v in emb.iter_mut() {
                *v /= norm;
            }
        }

        vectors.push(emb);
    }

    Ok(Json(EmbedResponse {
        vectors,
        dimensions: EMBEDDING_DIM,
    }))
}

// ─── Entrypoint ───

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let model_dir = std::env::var("MODEL_DIR").unwrap_or_else(|_| "/models".into());
    let port = std::env::var("PORT").unwrap_or_else(|_| "8000".into());

    let tokenizer_path = format!("{}/tokenizer.json", model_dir);
    let model_path = format!("{}/model.onnx", model_dir);

    info!("Loading tokenizer: {}", tokenizer_path);
    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| format!("Failed to load tokenizer: {}", e))?;

    info!("Loading ONNX model: {}", model_path);
    let session = Session::builder()?
        .with_optimization_level(GraphOptimizationLevel::Level3)?
        .commit_from_file(&model_path)?;

    info!(
        "Model loaded — {} dimensions, max seq {}",
        EMBEDDING_DIM, MAX_SEQ_LEN
    );

    let state = Arc::new(AppState { session, tokenizer });

    let app = Router::new()
        .route("/health", get(health))
        .route("/embed", post(embed))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    info!("Embedding server listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
