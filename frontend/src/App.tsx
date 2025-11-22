import { useState } from "react";
import "./App.css";
import { fetchImage } from "./utils/fetchImage";
import { uploadImageFromUrl, getImageFromId } from "./utils/walrus";

function App() {
  const [imageUrl, setImageUrl] = useState<string>("");

  const handleClick = async () => {
    try {
      // const imageUrl = await fetchImage();
      // setImageUrl(imageUrl);

      const img = await getImageFromId();
      setImageUrl(img);
      // uploadImageFromUrl(imageUrl);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <button onClick={handleClick}>Fetch Image</button>
        <div style={{ marginTop: "20px" }}>
          {imageUrl && <img src={imageUrl} alt="Fetched" />}
        </div>
      </header>
    </div>
  );
}

export default App;
