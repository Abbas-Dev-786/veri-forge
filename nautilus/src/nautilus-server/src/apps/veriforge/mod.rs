use crate::common::{to_signed_response, IntentScope, ProcessDataRequest, ProcessedDataResponse};
use crate::AppState;
use crate::EnclaveError;
use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use sha2::{Sha256, Digest}; // Add sha2 to Cargo.toml

// 1. Define the Request Structure
#[derive(Debug, Serialize, Deserialize)]
pub struct GenRequest {
    pub prompt: String,
    pub seed: Option<u64>,
}

// 2. Define the Response Payload (Must match Move struct)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GenPayload {
    pub image_hash: Vec<u8>,
    pub prompt_hash: Vec<u8>,
    pub seed: u64,
    pub walrus_blob_id: String, // In a real flow, Enclave might upload, or sign the ID provided by user
}

// 3. The Core Processing Logic
pub async fn process_generation(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<GenRequest>>,
) -> Result<Json<ProcessedDataResponse<crate::common::IntentMessage<GenPayload>>>, EnclaveError> {
    
    // A. Call Fal.ai (Flux.1 dev)
    let client = reqwest::Client::new();
    let fal_api_key = std::env::var("FAL_KEY").map_err(|_| EnclaveError::GenericError("API Key missing".into()))?;
    
    let seed = request.payload.seed.unwrap_or(42); // Simplified seed logic
    
    let params = json!({
        "prompt": request.payload.prompt,
        "seed": seed,
        "image_size": "square_hd"
    });

    // Note: In production, ensure outgoing traffic is allowed in `allowed_endpoints.yaml`
    let res = client.post("https://fal.run/fal-ai/flux/dev")
        .header("Authorization", format!("Key {}", fal_api_key))
        .header("Content-Type", "application/json")
        .json(&params)
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("Fal.ai request failed: {}", e)))?;

    let fal_json: Value = res.json().await.map_err(|e| EnclaveError::GenericError(format!("Failed to parse Fal json: {}", e)))?;
    
    let image_url = fal_json["images"][0]["url"].as_str()
        .ok_or(EnclaveError::GenericError("No image url in response".into()))?;

    // B. Fetch the actual image bytes to hash them
    let image_bytes = client.get(image_url)
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("Failed to fetch image bytes: {}", e)))?
        .bytes()
        .await
        .map_err(|e| EnclaveError::GenericError("Failed to read image bytes".into()))?;

    // C. Compute Hashes
    let mut hasher = Sha256::new();
    hasher.update(&image_bytes);
    let image_hash = hasher.finalize().to_vec();

    let mut prompt_hasher = Sha256::new();
    prompt_hasher.update(request.payload.prompt.as_bytes());
    let prompt_hash = prompt_hasher.finalize().to_vec();

    // D. Construct Response
    // NOTE: In this flow, we return the image URL so the frontend can upload to Walrus.
    // Ideally, the Enclave would upload to Walrus directly to ensure the Blob ID matches the hash,
    // but for this MVP, we sign the hash, and the frontend handles storage.
    
    let current_timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    // We use a placeholder for blob_id in the signature, 
    // or we require the frontend to upload first and send the ID (2-step).
    // To keep it simple: We sign the IMAGE HASH. The contract stores the hash. 
    // The blob_id is informational metadata in the NFT.
    
    let payload = GenPayload {
        image_hash,
        prompt_hash,
        seed,
        walrus_blob_id: image_url.to_string(), // Storing fal URL temporarily for MVP
    };

    Ok(Json(to_signed_response(
        &state.eph_kp,
        payload,
        current_timestamp,
        IntentScope::Custom(0), // Matches Move scope 0
    )))
}