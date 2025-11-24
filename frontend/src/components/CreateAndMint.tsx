import { useState, useRef } from "react";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import {
  ENCLAVE_OBJECT_ID,
  ENCLAVE_URL,
  PACKAGE_ID,
  REGISTRY_ID,
} from "../constants";
import { getImageFromId } from "../utils/walrus";

// Helper to upload source image to Walrus
const uploadToWalrus = async (file: File): Promise<string> => {
  const response = await fetch(
    "https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=1",
    {
      method: "PUT",
      body: file,
    }
  );
  if (!response.ok) throw new Error("Failed to upload source image to Walrus");
  const data = await response.json();
  const blobId = data.newlyCreated.blobObject.blobId;
  return blobId;
};

export function CreateAndMint() {
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for Editing & Generation
  const [mode, setMode] = useState<"generate" | "edit">("generate");
  const [prompt, setPrompt] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState("");

  const [status, setStatus] = useState<
    "idle" | "uploading" | "generating" | "minting" | "success" | "error"
  >("idle");
  const [txDigest, setTxDigest] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSourceFile(file);
      setSourcePreview(URL.createObjectURL(file));
    }
  };

  const handleGenerate = async () => {
    setStatus("uploading");
    setErrorMsg("");
    setGeneratedImage("");
    setTxDigest("");

    try {
      let sourceImageUrl = null;

      // 1. Upload Source Image if in Edit Mode
      if (mode === "edit") {
        if (!sourceFile)
          throw new Error("Please upload a source image for editing.");
        console.log("Uploading source to Walrus...");
        sourceImageUrl = await uploadToWalrus(sourceFile);
      }

      // 2. Request Generation from Enclave
      setStatus("generating");
      const reqBody = {
        payload: {
          prompt: prompt,
          seed: Math.floor(Math.random() * 1000000),
          source_image_url: sourceImageUrl,
          model: mode === "edit" ? "flux-edit" : "flux-dev",
        },
      };

      const response = await fetch(ENCLAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!response.ok)
        throw new Error(`Enclave error: ${response.statusText}`);

      const data = await response.json();
      const { signature, response: intentMessage } = data;
      const payload = intentMessage.data;

      const image = await getImageFromId(payload.walrus_blob_id);

      setGeneratedImage(image);
      setStatus("minting");

      // 3. Construct Transaction
      const tx = new Transaction();

      // Convert Arrays
      const imageHashBytes = new Uint8Array(payload.image_hash);
      const promptHashBytes = new Uint8Array(payload.prompt_hash);
      const sourceHashBytes = new Uint8Array(payload.source_image_hash || []);
      const signatureBytes = fromHex(signature);

      // String Encodings (Manual encoding to match Enclave)
      const walrusBytes = new TextEncoder().encode(payload.walrus_blob_id);
      const modelBytes = new TextEncoder().encode(payload.model);

      // Create Move Strings
      const [walrusString] = tx.moveCall({
        target: "0x1::string::utf8",
        arguments: [tx.pure.vector("u8", walrusBytes)],
      });
      const [modelString] = tx.moveCall({
        target: "0x1::string::utf8",
        arguments: [tx.pure.vector("u8", modelBytes)],
      });

      tx.moveCall({
        target: `${PACKAGE_ID}::certifier::mint_certificate`,
        typeArguments: [`${PACKAGE_ID}::certifier::VeriforgeApp`],
        arguments: [
          tx.object(REGISTRY_ID),
          tx.object(ENCLAVE_OBJECT_ID),
          tx.pure.vector("u8", Array.from(imageHashBytes)),
          tx.pure.vector("u8", Array.from(promptHashBytes)),
          tx.pure.vector("u8", Array.from(sourceHashBytes)),
          modelString,
          tx.pure.u64(payload.seed),
          walrusString,
          tx.pure.u64(intentMessage.timestamp_ms),
          tx.pure.vector("u8", Array.from(signatureBytes)),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            setTxDigest(result.digest);
            setStatus("success");
          },
          onError: (err) => {
            setErrorMsg(err.message);
            setStatus("error");
          },
        }
      );
    } catch (e: any) {
      console.error("Error:", e);
      setErrorMsg(e.message || "Unknown error");
      setStatus("error");
    }
  };

  return (
    <div className="p-6 border border-gray-700 rounded-lg bg-gray-800 shadow-xl">
      {/* Tabs for Model Selection */}
      <div className="flex gap-4 mb-6 bg-gray-900 p-1 rounded-lg">
        <button
          onClick={() => setMode("generate")}
          className={`flex-1 py-2 rounded font-bold transition-all ${
            mode === "generate"
              ? "bg-blue-600 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Text to Image
        </button>
        <button
          onClick={() => setMode("edit")}
          className={`flex-1 py-2 rounded font-bold transition-all ${
            mode === "edit"
              ? "bg-blue-600 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Edit Image
        </button>
      </div>

      {/* Image Upload for Edit Mode */}
      {mode === "edit" && (
        <div
          className="mb-6 border-2 border-dashed border-gray-600 rounded-lg p-4 text-center hover:border-blue-500 cursor-pointer transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/*"
          />
          {sourcePreview ? (
            <div className="relative">
              <img
                src={sourcePreview}
                alt="Source"
                className="h-48 mx-auto rounded shadow-lg"
              />
              <p className="mt-2 text-sm text-green-400">
                Click to change source image
              </p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-xl text-gray-300">
                Click to upload source image
              </p>
              <p className="text-sm text-gray-500">JPG, PNG supported</p>
            </div>
          )}
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-gray-300">
          {mode === "generate" ? "Prompt" : "Editing Instructions"}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full p-3 bg-gray-900 border border-gray-600 rounded text-white focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder={
            mode === "generate"
              ? "A cyberpunk city..."
              : "Make it look like a Van Gogh painting..."
          }
          rows={3}
        />
      </div>

      {/* Result Preview (No Download Button) */}
      {generatedImage && (
        <div className="mb-6 text-center animate-fade-in">
          <p className="text-sm text-gray-400 mb-2">Generated Result:</p>
          <img
            src={generatedImage}
            className="w-full rounded-lg border border-gray-600"
            alt="Generated Result"
          />
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={handleGenerate}
        disabled={
          status === "uploading" ||
          status === "generating" ||
          status === "minting"
        }
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-3 px-4 rounded transition-colors"
      >
        {status === "uploading" && "Uploading Source..."}
        {status === "generating" && "Generating AI Image..."}
        {status === "minting" && "Minting Certificate..."}
        {status === "idle" && (mode === "generate" ? "Generate" : "Edit Image")}
        {status === "success" && "Success! Create Another"}
        {status === "error" && "Try Again"}
      </button>

      {/* Explorer Link Display */}
      {status === "success" && (
        <div className="mt-4 p-4 bg-green-900/30 border border-green-500/50 rounded text-green-200">
          <p className="font-bold">✅ Certificate Minted!</p>
          <a
            href={`https://suiscan.xyz/testnet/tx/${txDigest}`}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline text-sm block mt-1"
          >
            View on SuiScan ↗
          </a>
        </div>
      )}

      {status === "error" && (
        <p className="mt-4 text-red-400 text-center">{errorMsg}</p>
      )}
    </div>
  );
}
