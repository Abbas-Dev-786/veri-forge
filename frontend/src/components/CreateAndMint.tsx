import { useState } from "react";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import { ENCLAVE_OBJECT_ID, ENCLAVE_URL, PACKAGE_ID } from "../constants";
import { getImageFromId } from "../utils/walrus";

export function CreateAndMint() {
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<
    "idle" | "generating" | "minting" | "success" | "error"
  >("idle");
  const [txDigest, setTxDigest] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");

  const handleGenerate = async () => {
    setStatus("generating");
    setErrorMsg("");
    setGeneratedImage("");

    try {
      // 1. Request Generation from Nautilus Enclave
      console.log("Calling Enclave...");
      const reqBody = {
        payload: {
          prompt: prompt,
          seed: Math.floor(Math.random() * 1000000),
        },
      };

      const response = await fetch(ENCLAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!response.ok) {
        throw new Error(`Enclave error: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Enclave Response:", data);

      // Extract signature and the intent message (which contains the payload)
      const { signature, response: intentMessage } = data;
      const payload = intentMessage.data;

      const img = await getImageFromId(payload.walrus_blob_id);

      // Save image URL to display in the UI
      setGeneratedImage(img);

      setStatus("minting");

      // 2. Construct Sui Transaction
      const tx = new Transaction();

      // Convert raw arrays/hex to formats Sui understands
      const imageHashBytes = new Uint8Array(payload.image_hash);
      const promptHashBytes = new Uint8Array(payload.prompt_hash);
      const signatureBytes = fromHex(signature);

      // IMPORTANT: Convert the JS string to a Move String object
      // We use the standard library function 'utf8' to do this conversion on-chain
      const [walrusString] = tx.moveCall({
        target: "0x1::string::utf8",
        arguments: [tx.pure.string(payload.walrus_blob_id)],
      });

      // 3. Call the Mint Function
      tx.moveCall({
        target: `${PACKAGE_ID}::certifier::mint_certificate`,
        // IMPORTANT: Pass the 'VeriforgeApp' witness type so the contract verifies the correct Enclave
        typeArguments: [`${PACKAGE_ID}::certifier::VeriforgeApp`],
        arguments: [
          tx.object(ENCLAVE_OBJECT_ID),
          tx.pure.vector("u8", Array.from(imageHashBytes)),
          tx.pure.vector("u8", Array.from(promptHashBytes)),
          tx.pure.u64(payload.seed),
          walrusString, // Pass the String object we created above
          tx.pure.u64(intentMessage.timestamp_ms),
          tx.pure.vector("u8", Array.from(signatureBytes)),
        ],
      });

      // 4. Execute Transaction
      signAndExecute(
        {
          transaction: tx,
        },
        {
          onSuccess: (result) => {
            console.log("Minted!", result);
            setTxDigest(result.digest);
            setStatus("success");
          },
          onError: (err) => {
            console.error("Mint failed:", err);
            setErrorMsg(err.message);
            setStatus("error");
          },
        }
      );
    } catch (e: any) {
      console.error("Generation failed:", e);
      setErrorMsg(e.message || "Unknown error");
      setStatus("error");
    }
  };

  return (
    <div className="p-6 border border-gray-700 rounded-lg bg-gray-800 shadow-xl">
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-gray-300">
          AI Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full p-3 bg-gray-900 border border-gray-600 rounded text-white focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="e.g., A cyberpunk city built on Sui blockchain, digital art"
          rows={3}
        />
      </div>

      {generatedImage && (
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-2">Preview:</p>
          <img
            src={generatedImage}
            alt="Generated"
            className="w-full rounded-lg border border-gray-600"
          />
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={
          status !== "idle" && status !== "success" && status !== "error"
        }
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-3 px-4 rounded transition-colors"
      >
        {status === "idle" && "Generate & Mint Certificate"}
        {status === "generating" && "Generating (Calling TEE)..."}
        {status === "minting" && "Minting NFT..."}
        {status === "success" && "Generate Another"}
        {status === "error" && "Try Again"}
      </button>

      {status === "success" && (
        <div className="mt-4 p-4 bg-green-900/30 border border-green-500/50 rounded text-green-200">
          <p className="font-bold">✅ Certificate Minted!</p>
          <a
            href={`https://suiscan.xyz/testnet/tx/${txDigest}`}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline text-sm"
          >
            View Transaction
          </a>
        </div>
      )}

      {status === "error" && (
        <div className="mt-4 p-4 bg-red-900/30 border border-red-500/50 rounded text-red-200">
          <p className="font-bold">❌ Error</p>
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}
