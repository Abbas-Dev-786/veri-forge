// Copyright (c) VeriForge
// SPDX-License-Identifier: Apache-2.0

module veriforge::certifier {
    use std::string::{String, utf8};
    use sui::event;
    // Import Table for the Registry
    use sui::table::{Self, Table}; 
    use enclave::enclave::{Self, Enclave};

    const EInvalidSignature: u64 = 0;
    const EImageAlreadyCertified: u64 = 1; // New error

    /// Holds the mapping of Image Hash -> Certificate ID
    public struct Registry has key {
        id: UID,
        images: Table<vector<u8>, ID>,
    }

    public struct ImageCertificate has key, store {
        id: UID,
        name: String,
        description: String,
        image_url: String, 
        prompt_hash: vector<u8>,
        image_hash: vector<u8>,
        seed: u64,
        timestamp_ms: u64,
    }

    public struct CertificateMinted has copy, drop {
        id: ID,
        owner: address,
        image_url: String,
    }

    public struct GenPayload has drop {
        image_hash: vector<u8>,
        prompt_hash: vector<u8>,
        seed: u64,
        walrus_blob_id: String,
    }

    /// Initialize the Registry (One-time setup)
    public fun setup_registry(ctx: &mut TxContext) {
        let registry = Registry {
            id: object::new(ctx),
            images: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    #[allow(lint(self_transfer))] 
    public fun mint_certificate<T>(
        registry: &mut Registry, // <--- Add Registry Argument
        enclave: &Enclave<T>,
        image_hash: vector<u8>,
        prompt_hash: vector<u8>,
        seed: u64,
        walrus_blob_id: String,
        timestamp_ms: u64,
        signature: vector<u8>,
        ctx: &mut TxContext
    ) {
        // 1. Check if image is already registered
        assert!(!table::contains(&registry.images, image_hash), EImageAlreadyCertified);

        // 2. Verify Signature
        let payload = GenPayload {
            image_hash: image_hash,
            prompt_hash: prompt_hash,
            seed: seed,
            walrus_blob_id: walrus_blob_id,
        };

        let is_valid = enclave::verify_signature(
            enclave,
            0, 
            timestamp_ms,
            payload,
            &signature
        );
        assert!(is_valid, EInvalidSignature);

        // 3. Mint NFT
        let id = object::new(ctx);
        let cert_id = object::uid_to_inner(&id); // Get ID for registry

        let cert = ImageCertificate {
            id,
            name: utf8(b"VeriForge Certified Image"),
            description: utf8(b"This image is cryptographically verified to be AI generated."),
            image_url: walrus_blob_id,
            prompt_hash,
            image_hash: image_hash, // Used for key
            seed,
            timestamp_ms,
        };

        // 4. Register the Hash -> ID mapping
        table::add(&mut registry.images, image_hash, cert_id);

        event::emit(CertificateMinted {
            id: cert_id,
            owner: ctx.sender(),
            image_url: cert.image_url,
        });

        transfer::public_transfer(cert, ctx.sender());
    }

    // ... (Keep VeriforgeApp and setup_enclave as they were) ...
    public struct VeriforgeApp has drop {}

    public fun setup_enclave(ctx: &mut TxContext) {
        // ... (Existing code) ...
        let app_witness = VeriforgeApp {};
        let cap = enclave::new_cap(app_witness, ctx);
        let pcr0 = vector[1, 2, 3];
        let pcr1: vector<u8> = vector[];
        let pcr2: vector<u8> = vector[];

        enclave::create_enclave_config(
            &cap,
            utf8(b"VeriForge Flux Enclave"),
            pcr0, 
            pcr1, 
            pcr2,
            ctx
        );
        transfer::public_transfer(cap, ctx.sender());
    }
}