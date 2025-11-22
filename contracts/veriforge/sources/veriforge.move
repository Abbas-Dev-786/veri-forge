// Copyright (c) VeriForge
// SPDX-License-Identifier: Apache-2.0

module veriforge::certifier {
    use std::string::{String, utf8};
    use sui::event;
    // "Self" imports the module "enclave::enclave" as just "enclave"
    use enclave::enclave::{Self, Enclave}; 

    /// Error codes
    const EInvalidSignature: u64 = 0;

    /// The Certificate NFT proving AI provenance
    public struct ImageCertificate has key, store {
        id: UID,
        name: String,
        description: String,
        /// The Walrus Blob ID or URL
        image_url: String, 
        /// Hash of the prompt used
        prompt_hash: vector<u8>,
        /// Hash of the generated image
        image_hash: vector<u8>,
        /// The model seed for reproducibility
        seed: u64,
        /// Timestamp of generation
        timestamp_ms: u64,
    }

    /// Event emitted when a new certificate is minted
    public struct CertificateMinted has copy, drop {
        id: ID,
        owner: address,
        image_url: String,
    }

    /// The payload signed by the Enclave. 
    /// Must match the Rust struct layout exactly (BCS serialization).
    public struct GenPayload has drop {
        image_hash: vector<u8>,
        prompt_hash: vector<u8>,
        seed: u64,
        walrus_blob_id: String,
    }

    /// Mint a verifiable certificate.
    /// This annotation suppresses the linter warning about transferring inside the function.
    #[allow(lint(self_transfer))] 
    public fun mint_certificate<T>(
        enclave: &Enclave<T>,
        image_hash: vector<u8>,
        prompt_hash: vector<u8>,
        seed: u64,
        walrus_blob_id: String,
        timestamp_ms: u64,
        signature: vector<u8>,
        ctx: &mut TxContext
    ) {
        // 1. Construct the payload to verify
        let payload = GenPayload {
            image_hash: image_hash,
            prompt_hash: prompt_hash,
            seed: seed,
            walrus_blob_id: walrus_blob_id,
        };

        // 2. Verify the Enclave's signature
        let is_valid = enclave::verify_signature(
            enclave,
            0, // scope
            timestamp_ms,
            payload,
            &signature
        );

        assert!(is_valid, EInvalidSignature);

        // 3. Mint and transfer the NFT
        let id = object::new(ctx);
        let cert = ImageCertificate {
            id,
            name: utf8(b"VeriForge Certified Image"),
            description: utf8(b"This image is cryptographically verified to be AI generated."),
            image_url: walrus_blob_id,
            prompt_hash,
            image_hash,
            seed,
            timestamp_ms,
        };

        event::emit(CertificateMinted {
            id: object::uid_to_inner(&cert.id),
            owner: ctx.sender(),
            image_url: cert.image_url,
        });

        transfer::public_transfer(cert, ctx.sender());
    }

    public struct VeriforgeApp has drop {}

    public fun setup_enclave(ctx: &mut TxContext) {
        // 1. Create a Capability for this App
        let app_witness = VeriforgeApp {};
        
        // FIX 1: Removed extra "enclave::" prefix
        let cap = enclave::new_cap(app_witness, ctx);

        // 2. Define dummy PCRs for Testnet
        let pcr0 = vector[1, 2, 3]; 
        // FIX 2: Added explicit type annotation ": vector<u8>"
        let pcr1: vector<u8> = vector[];
        let pcr2: vector<u8> = vector[];

        // 3. Create the Config Object (Shared Object)
        // FIX 1: Removed extra "enclave::" prefix
        enclave::create_enclave_config(
            &cap,
            utf8(b"VeriForge Flux Enclave"),
            pcr0, 
            pcr1, 
            pcr2,
            ctx
        );

        // 4. Send the Admin Cap to the deployer
        transfer::public_transfer(cap, ctx.sender());
    }
}