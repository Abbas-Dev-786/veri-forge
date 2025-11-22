import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import "./App.css";
import { CreateAndMint } from "./components/CreateAndMint";
import "@mysten/dapp-kit/dist/index.css";
// import { useState } from "react";
// import { fetchImage } from "./utils/fetchImage";
// import { uploadImageFromUrl, getImageFromId } from "./utils/walrus";

function App() {
  const account = useCurrentAccount();
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
      <header className="w-full max-w-3xl flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
            VeriForge
          </h1>
          <p className="text-gray-400 mt-1">Decentralized AI Provenance</p>
        </div>
        <ConnectButton />
      </header>

      <main className="w-full max-w-2xl">
        {!account ? (
          <div className="text-center p-12 border border-gray-700 rounded-xl bg-gray-800">
            <h2 className="text-xl mb-4">Welcome to VeriForge</h2>
            <p className="text-gray-400 mb-6">
              Connect your wallet to generate authenticated AI art.
            </p>
          </div>
        ) : (
          <CreateAndMint />
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
