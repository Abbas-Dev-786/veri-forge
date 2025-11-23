import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import "./App.css";
import { CreateAndMint } from "./components/CreateAndMint";
import "@mysten/dapp-kit/dist/index.css";
import { VerifyCertificate } from "./components/VerifyCertificate";
import { useState } from "react";
import { VerifyByImage } from "./components/VerifyByImage";
// import { useState } from "react";
// import { fetchImage } from "./utils/fetchImage";
// import { uploadImageFromUrl, getImageFromId } from "./utils/walrus";

function App() {
  const account = useCurrentAccount();
  const [activeTab, setActiveTab] = useState<"create" | "verify">("create");
  // const [imageUrl, setImageUrl] = useState<string>("");

  // const handleClick = async () => {
  //   try {
  //     // const imageUrl = await fetchImage();
  //     // setImageUrl(imageUrl);

  //     const img = await getImageFromId();
  //     setImageUrl(img);
  //     // uploadImageFromUrl(imageUrl);
  //   } catch (err) {
  //     console.error(err);
  //   }
  // };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-8">
      <header className="w-full max-w-3xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-linear-to-r from-blue-400 to-teal-400">
            VeriForge
          </h1>
          <p className="text-gray-400 mt-1">Decentralized AI Provenance</p>
        </div>
        <ConnectButton />
      </header>

      {/* Navigation Tabs */}
      <div className="flex gap-4 mb-8 bg-gray-800 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("create")}
          className={`px-6 py-2 rounded-md transition-all ${
            activeTab === "create"
              ? "bg-blue-600 text-white shadow-lg"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Create & Mint
        </button>
        <button
          onClick={() => setActiveTab("verify")}
          className={`px-6 py-2 rounded-md transition-all ${
            activeTab === "verify"
              ? "bg-blue-600 text-white shadow-lg"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Verify Certificate
        </button>
      </div>

      <main className="w-full max-w-2xl">
        {activeTab === "create" ? (
          !account ? (
            <div className="text-center p-12 border border-gray-700 rounded-xl bg-gray-800">
              <h2 className="text-xl mb-4">Welcome to VeriForge</h2>
              <p className="text-gray-400 mb-6">
                Connect your wallet to generate authenticated AI art.
              </p>
            </div>
          ) : (
            <CreateAndMint />
          )
        ) : (
          <>
            <VerifyCertificate />
            <VerifyByImage />
          </>
        )}
      </main>

      <footer className="mt-auto pt-12 text-gray-500 text-sm">
        Powered by Sui, Nautilus (TEEs) & Walrus
      </footer>
    </div>
    // <div className="App">
    //   <header className="App-header">
    //     <button onClick={handleClick}>Fetch Image</button>
    //     <div style={{ marginTop: "20px" }}>
    //       {imageUrl && <img src={imageUrl} alt="Fetched" />}
    //     </div>
    //   </header>
    // </div>
  );
}

export default App;
