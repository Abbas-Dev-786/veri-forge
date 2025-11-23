import { useState, useRef } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { REGISTRY_ID } from "../constants";

// Helper: Convert Hex String to Byte Array (Browser Compatible)
const hexToBytes = (hex: string): number[] => {
  const bytes = [];
  for (let c = 0; c < hex.length; c += 2) {
    bytes.push(parseInt(hex.substr(c, 2), 16));
  }
  return bytes;
};

// Helper: Calculate SHA-256 Hash of a File
const hashFile = async (blob: Blob): Promise<string> => {
  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export function VerifyByImage() {
  const suiClient = useSuiClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<
    "idle" | "analyzing" | "found" | "not_found" | "error"
  >("idle");
  const [nftData, setNftData] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    setStatus("analyzing");
    setNftData(null);

    try {
      // 1. Calculate Hash
      const hashHex = await hashFile(file);
      console.log("📷 Calculated Image Hash:", hashHex);

      // 2. Convert to Bytes for Move Query (No Buffer used!)
      const hashBytes = hexToBytes(hashHex);

      // 3. Query Registry
      // We verify if this hash exists as a key in the on-chain table
      const fieldObj = await suiClient.getDynamicFieldObject({
        parentId: REGISTRY_ID,
        name: {
          type: "vector<u8>",
          value: hashBytes,
        },
      });

      console.log("🔎 Registry Lookup Result:", fieldObj);

      if (fieldObj.error || !fieldObj.data) {
        console.warn("❌ Hash not found in registry:", hashHex);
        setStatus("not_found");
        return;
      }

      // 4. Fetch Certificate
      const certId = (fieldObj.data.content as any).fields.value;
      console.log("✅ Found Certificate ID:", certId);

      const certObj = await suiClient.getObject({
        id: certId,
        options: { showContent: true, showOwner: true },
      });

      if (!certObj.data?.content) throw new Error("Certificate data missing");

      const fields = (certObj.data.content as any).fields;

      setNftData({
        id: certId,
        owner: (certObj.data.owner as any)?.AddressOwner || "Shared",
        imageUrl: fields.image_url,
        seed: fields.seed,
        timestamp: new Date(Number(fields.timestamp_ms)).toLocaleString(),
      });

      setStatus("found");
    } catch (e) {
      console.error("Verification failed:", e);
      setStatus("error");
    }
  };

  return (
    <div className="p-6 border border-gray-700 rounded-lg bg-gray-800 shadow-xl mt-8">
      <h2 className="text-2xl font-bold mb-4 text-white">
        Reverse Image Verification
      </h2>
      <div
        className="flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg p-8 hover:border-blue-500 transition-colors cursor-pointer bg-gray-900/50"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          // accept="image/*"
        />
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Preview"
            className="max-h-64 rounded-lg shadow-md"
          />
        ) : (
          <div className="text-center">
            <p className="text-xl text-gray-300">Click to Upload Image</p>
            <p className="text-sm text-gray-500">Supports JPG, PNG</p>
          </div>
        )}
      </div>

      {status === "analyzing" && (
        <p className="text-blue-400 mt-4 animate-pulse">
          🔍 Analyzing cryptographic signature...
        </p>
      )}

      {status === "not_found" && (
        <div className="mt-6 p-4 bg-red-900/30 border border-red-500 rounded-lg text-red-200">
          <h3 className="font-bold text-lg">❌ Not Verified</h3>
          <p>This image does not match any certificate on the blockchain.</p>
        </div>
      )}

      {status === "found" && nftData && (
        <div className="mt-6 p-4 bg-green-900/30 border border-green-500 rounded-lg text-green-100 animate-fade-in">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
            <span>✅</span> Verified Authentic
          </h3>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-gray-400">Creator:</span>{" "}
              <span className="font-mono text-blue-300 break-all">
                {nftData.owner}
              </span>
            </p>
            <p>
              <span className="text-gray-400">Minted:</span> {nftData.timestamp}
            </p>
            <div className="pt-2">
              <a
                href={`https://suiscan.xyz/testnet/object/${nftData.id}`}
                target="_blank"
                className="bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded text-xs uppercase font-bold tracking-wide transition-colors"
              >
                View On-Chain Record
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
