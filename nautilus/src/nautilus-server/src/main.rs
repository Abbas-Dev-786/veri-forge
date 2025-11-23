// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use axum::{routing::get, routing::post, Router};
// FIX: Added 'ToFromBytes' to imports so we can use 'from_bytes'
use fastcrypto::traits::ToFromBytes; 
use fastcrypto::ed25519::Ed25519KeyPair;
use nautilus_server::app::process_data;
use nautilus_server::common::{get_attestation, health_check};
use nautilus_server::AppState;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    // FIXED SEED: Uses a constant seed so the Public Key never changes.
    // This prevents invalid signature errors when restarting the server.
    let seed = [0u8; 32]; 
    let eph_kp = Ed25519KeyPair::from_bytes(&seed).unwrap();

    // API Key Setup
    #[cfg(not(feature = "seal-example"))]
    let api_key = "045a27812dbe456392913223221306".to_string();
    // let api_key = std::env::var("API_KEY").expect("API_KEY must be set");

    #[cfg(feature = "seal-example")]
    let api_key = String::new();

    let state = Arc::new(AppState { eph_kp, api_key });

    #[cfg(feature = "seal-example")]
    {
        nautilus_server::app::spawn_host_init_server(state.clone()).await?;
    }

    // CORS Setup
    let cors = CorsLayer::new()
        .allow_methods(Any)
        .allow_headers(Any)
        .allow_origin(Any);

    let app = Router::new()
        .route("/", get(ping))
        .route("/get_attestation", get(get_attestation))
        .route("/process_data", post(process_data))
        .route("/health_check", get(health_check))
        .with_state(state)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app.into_make_service())
        .await
        .map_err(|e| anyhow::anyhow!("Server error: {e}"))
}

async fn ping() -> &'static str {
    "Pong!"
}



