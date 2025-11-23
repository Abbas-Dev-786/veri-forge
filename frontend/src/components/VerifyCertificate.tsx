import { useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { hashFile, hashText } from "../utils/hashing";

export function VerifyCertificate() {
  const suiClient = useSuiClient();
  const [objectId, setObjectId] = useState("");
  const [nftData, setNftData] = useState<any>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const [verificationStatus, setVerificationStatus] = useState<{
    image: "pending" | "verified" | "tampered";
    prompt: "pending" | "verified" | "mismatch";
  }>({ image: "pending", prompt: "pending" });

  const [inputPrompt, setInputPrompt] = useState("");

  /** Convert number[] → hex string (browser safe) */
  const vectorToHex = (arr: number[]): string => {
    return new Uint8Array(arr).reduce(
      (acc, b) => acc + b.toString(16).padStart(2, "0"),
      ""
    );
  };

  const fetchCertificate = async () => {
    setStatus("loading");
    setNftData(null);
    setVerificationStatus({ image: "pending", prompt: "pending" });

    try {
      const obj = await suiClient.getObject({
        id: objectId,
        options: { showContent: true, showOwner: true },
      });

      if (obj.error || !obj.data?.content) {
        throw new Error("Certificate not found");
      }

      const fields = (obj.data.content as any).fields;

      setNftData({
        id: obj.data.objectId,
        owner: (obj.data.owner as any)?.AddressOwner || "Shared",
        imageUrl: fields.image_url,
        imageHash: fields.image_hash, // vector<u8> → number[]
        promptHash: fields.prompt_hash, // vector<u8> → number[]
        seed: fields.seed,
        timestamp: new Date(Number(fields.timestamp_ms)).toLocaleString(),
      });

      setStatus("success");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  };

  const verifyImageIntegrity = async () => {
    if (!nftData) return;

    try {
      const response = await fetch(nftData.imageUrl);
      const blob = await response.blob();

      const calculatedHash = await hashFile(blob);

      // Convert stored vector<u8> to hex
      const onChainHash = vectorToHex(nftData.imageHash);

      if (calculatedHash === onChainHash) {
        setVerificationStatus((prev) => ({ ...prev, image: "verified" }));
      } else {
        setVerificationStatus((prev) => ({ ...prev, image: "tampered" }));
        console.error("Hash mismatch!", {
          calculated: calculatedHash,
          onChain: onChainHash,
        });
      }
    } catch (e) {
      console.error("Verification failed", e);
      alert("Failed to download or hash image.");
    }
  };

  const verifyPrompt = async () => {
    if (!nftData || !inputPrompt) return;

    const calculatedHash = await hashText(inputPrompt);

    // Convert stored vector<u8> to hex
    const onChainHash = vectorToHex(nftData.promptHash);

    if (calculatedHash === onChainHash) {
      setVerificationStatus((prev) => ({ ...prev, prompt: "verified" }));
    } else {
      setVerificationStatus((prev) => ({ ...prev, prompt: "mismatch" }));
    }
  };

  return (
    <div className="p-6 border border-gray-700 rounded-lg bg-gray-800 shadow-xl mt-8">
      <h2 className="text-2xl font-bold mb-4 text-white">Verify Certificate</h2>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Enter NFT Object ID (0x...)"
          value={objectId}
          onChange={(e) => setObjectId(e.target.value)}
          className="flex-1 p-3 bg-gray-900 border border-gray-600 rounded text-white"
        />
        <button
          onClick={fetchCertificate}
          disabled={status === "loading"}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded font-bold"
        >
          {status === "loading" ? "Fetching..." : "Load"}
        </button>
      </div>

      {status === "error" && (
        <p className="text-red-400">❌ Certificate not found or invalid ID.</p>
      )}

      {nftData && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <img
                src={nftData.imageUrl}
                alt="Certified Asset"
                className="w-full rounded-lg border-2 border-gray-600"
              />
              <div className="mt-2 text-center">
                {verificationStatus.image === "pending" && (
                  <button
                    onClick={verifyImageIntegrity}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    Verify Image Integrity via Walrus
                  </button>
                )}
                {verificationStatus.image === "verified" && (
                  <span className="text-green-400 font-bold flex items-center justify-center gap-2">
                    ✅ Image Content Verified (Untampered)
                  </span>
                )}
                {verificationStatus.image === "tampered" && (
                  <span className="text-red-500 font-bold">
                    ⚠️ Hash Mismatch! Image may be altered.
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-gray-500 text-xs uppercase tracking-wider">
                  Creator
                </h3>
                <p className="font-mono text-sm break-all">{nftData.owner}</p>
              </div>

              <div>
                <h3 className="text-gray-500 text-xs uppercase tracking-wider">
                  Generation Time
                </h3>
                <p>{nftData.timestamp}</p>
              </div>

              <div>
                <h3 className="text-gray-500 text-xs uppercase tracking-wider">
                  Model Seed
                </h3>
                <p className="font-mono">{nftData.seed}</p>
              </div>

              <div className="p-4 bg-gray-900 rounded border border-gray-700">
                <h3 className="text-gray-500 text-xs uppercase tracking-wider mb-2">
                  Prompt Verification
                </h3>
                <p className="text-xs text-gray-400 mb-2">
                  The prompt text is hidden for privacy. Enter the prompt below
                  to verify it.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter original prompt..."
                    value={inputPrompt}
                    onChange={(e) => setInputPrompt(e.target.value)}
                    className="flex-1 p-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                  />
                  <button
                    onClick={verifyPrompt}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                  >
                    Check
                  </button>
                </div>
                <div className="mt-2">
                  {verificationStatus.prompt === "verified" && (
                    <span className="text-green-400 text-sm">
                      ✅ Prompt Matches!
                    </span>
                  )}
                  {verificationStatus.prompt === "mismatch" && (
                    <span className="text-red-400 text-sm">
                      ❌ Prompt does not match.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
