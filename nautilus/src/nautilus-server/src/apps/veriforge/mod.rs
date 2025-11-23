use crate::common::{to_signed_response, IntentScope, ProcessDataRequest, ProcessedDataResponse};
use crate::AppState;
use crate::EnclaveError;
use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use sha2::{Sha256, Digest};

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
    pub walrus_blob_id: String,
}

// 3. The Core Processing Logic
// CHANGE: Renamed from 'process_generation' to 'process_data' to match main.rs expectation
pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<GenRequest>>,
) -> Result<Json<ProcessedDataResponse<crate::common::IntentMessage<GenPayload>>>, EnclaveError> {
    
    // A. Call Fal.ai (Flux.1 dev)
    let client = reqwest::Client::new();
    let fal_api_key = std::env::var("FAL_KEY").map_err(|_| EnclaveError::GenericError("API Key missing".into()))?;
    
    let seed = request.payload.seed.unwrap_or(42); 
    
    let params = json!({
        "prompt": request.payload.prompt,
        "seed": seed,
        "image_size": "square_hd"
    });

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
        // CHANGE: Added underscore to '_e' to suppress warning
        .map_err(|_e| EnclaveError::GenericError("Failed to read image bytes".into()))?;

    // C. Compute Hashes
    let mut hasher = Sha256::new();
    hasher.update(&image_bytes);
    let image_hash = hasher.finalize().to_vec();

    let mut prompt_hasher = Sha256::new();
    prompt_hasher.update(request.payload.prompt.as_bytes());
    let prompt_hash = prompt_hasher.finalize().to_vec();

    // D. Construct Response
    let current_timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let publisher_url = "https://publisher.walrus-testnet.walrus.space/v1/blobs";
    let walrus_res = client.put(publisher_url)
        .body(image_bytes.clone()) // Send the bytes
        .send().await
        .map_err(|e| EnclaveError::GenericError(format!("Walrus upload failed: {e}")))?;

    // 3. Parse Blob ID
    let walrus_json: Value = walrus_res.json().await
        .map_err(|e| EnclaveError::GenericError(format!("Failed to parse Walrus response: {e}")))?;
    
    let blob_id = walrus_json.get("newlyCreated")
        .and_then(|n| n.get("blobObject"))
        .and_then(|b| b.get("blobId"))
        .and_then(|id| id.as_str())
        .ok_or(EnclaveError::GenericError("Walrus response missing blobId".into()))?;

    // 4. Construct Walrus Aggregator URL (Permanent Link)
    let permanent_url = format!("https://aggregator.walrus-testnet.walrus.space/v1/{}", blob_id);
    

    let payload = GenPayload {
        image_hash,
        prompt_hash,
        seed,
        walrus_blob_id: blob_id.to_string(), 
    };

    Ok(Json(to_signed_response(
        &state.eph_kp,
        payload,
        current_timestamp,
        IntentScope::ProcessData, 
    )))
}