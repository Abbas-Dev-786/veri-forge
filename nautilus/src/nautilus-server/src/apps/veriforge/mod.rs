use crate::common::{to_signed_response, IntentScope, ProcessDataRequest, ProcessedDataResponse};
use crate::AppState;
use crate::EnclaveError;
use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use sha2::{Sha256, Digest};

#[derive(Debug, Serialize, Deserialize)]
pub struct GenRequest {
    pub prompt: String,
    pub seed: Option<u64>,
    pub source_image_url: Option<String>, // URL or Blob ID
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GenPayload {
    pub image_hash: Vec<u8>,
    pub prompt_hash: Vec<u8>,
    pub seed: u64,
    pub walrus_blob_id: String,
    pub source_image_hash: Vec<u8>,
    pub model: String,
}

pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<GenRequest>>,
) -> Result<Json<ProcessedDataResponse<crate::common::IntentMessage<GenPayload>>>, EnclaveError> {
    
    let client = reqwest::Client::new();
    let fal_api_key = std::env::var("FAL_KEY")
        .map_err(|_| EnclaveError::GenericError("API Key missing".into()))?;
    let seed = request.payload.seed.unwrap_or(42);

    let mut source_image_hash = Vec::new();
    let endpoint: &str;
    let params: Value;

    // ================================
    // === EDIT / IMAGE-TO-IMAGE MODE ==
    // ================================
    if let Some(input_url) = &request.payload.source_image_url {
        endpoint = "https://fal.run/fal-ai/flux/dev/image-to-image";

        // 1. Construct standardized Walrus URL
        // If the frontend sends just the ID, prepending the aggregator URL.
        let blob_url = if input_url.starts_with("http") {
            input_url.clone()
        } else {
            format!("https://aggregator.walrus-testnet.walrus.space/v1/blobs/{}", input_url)
        };

        // 2. Download source bytes for PROVENANCE (Hashing) only.
        // We do not send these bytes to Fal.ai; we send the URL.
        let source_bytes = client
            .get(&blob_url)
            .send()
            .await
            .map_err(|e| EnclaveError::GenericError(format!("Failed to fetch source image for hashing: {e}")))?
            .bytes()
            .await
            .map_err(|_| EnclaveError::GenericError("Failed to read source bytes".into()))?;

        let mut hasher = Sha256::new();
        hasher.update(&source_bytes);
        source_image_hash = hasher.finalize().to_vec();

        // 3. Prepare JSON Params for Fal.ai
        // The API expects "image_url" as a string.
        params = json!({
            "image_url": blob_url,
            "prompt": request.payload.prompt,
            "strength": 0.85, // Adjust strength (0.0 to 1.0)
            "seed": seed,
            "guidance_scale": 3.5,
            "num_inference_steps": 40,
            "enable_safety_checker": true
        });
    } 
    // =========================
    // === GENERATE MODE =======
    // =========================
    else {
        endpoint = "https://fal.run/fal-ai/flux/dev";

        params = json!({
            "prompt": request.payload.prompt,
            "seed": seed,
            "image_size": "square_hd",
            "num_inference_steps": 28,
            "guidance_scale": 3.5,
            "enable_safety_checker": true
        });
    }

    // 4. Call AI Provider (Standard JSON POST for both modes)
    let fal_response = client
        .post(endpoint)
        .header("Authorization", format!("Key {}", fal_api_key))
        .header("Content-Type", "application/json")
        .json(&params)
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("AI request failed: {}", e)))?;

    // Check for non-200 status
    if !fal_response.status().is_success() {
        let error_text = fal_response.text().await.unwrap_or_default();
        return Err(EnclaveError::GenericError(format!("Fal.ai API Error: {}", error_text)));
    }

    let fal_json: Value = fal_response.json().await
        .map_err(|e| EnclaveError::GenericError(format!("Failed to parse AI response: {}", e)))?;

    // 5. Extract Result URL
    // Fal.ai returns: { "images": [ { "url": "...", ... } ] }
    let image_url = fal_json
        .get("images")
        .and_then(|arr| arr.get(0))
        .and_then(|img| img.get("url"))
        .and_then(|url| url.as_str())
        .ok_or_else(|| EnclaveError::GenericError(format!(
            "Fal.ai response missing image url: {}",
            fal_json
        )))?;

    // 6. Process Result (Download & Hash)
    let image_bytes = client
        .get(image_url)
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("Failed to fetch result: {e}")))?
        .bytes()
        .await
        .map_err(|_| EnclaveError::GenericError("Failed to read result bytes".into()))?;

    // Hash generated image
    let mut hasher = Sha256::new();
    hasher.update(&image_bytes);
    let image_hash = hasher.finalize().to_vec();

    // Hash prompt
    let mut prompt_hasher = Sha256::new();
    prompt_hasher.update(request.payload.prompt.as_bytes());
    let prompt_hash = prompt_hasher.finalize().to_vec();

    // 7. Upload to Walrus
    let publisher_url = "https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=1";

    let walrus_res = client
        .put(publisher_url)
        .body(image_bytes.clone())
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("Walrus upload failed: {e}")))?;

    if !walrus_res.status().is_success() {
        return Err(EnclaveError::GenericError(format!(
            "Walrus Error: {}",
            walrus_res.status()
        )));
    }

    let walrus_json: Value = walrus_res
        .json()
        .await
        .map_err(|_| EnclaveError::GenericError("Invalid Walrus JSON".into()))?;
        
    let blob_id = walrus_json["newlyCreated"]["blobObject"]["blobId"]
        .as_str()
        .unwrap()
        .to_string();

    // let permanent_url = format!("https://aggregator-testnet.walrus.space/v1/{}", blob_id);

    // 8. Build signed payload
    let payload = GenPayload {
        image_hash,
        prompt_hash,
        seed,
        walrus_blob_id: blob_id,
        source_image_hash,
        model: request.payload.model,
    };

    Ok(Json(to_signed_response(
        &state.eph_kp,
        payload,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        IntentScope::ProcessData,
    )))
}