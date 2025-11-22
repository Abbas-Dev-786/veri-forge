import { WALRUS_AGGREGATOR_URL, WALRUS_PUBLISHER_URL } from "../constants";

export async function uploadImageFromUrl(imageUrl: string) {
  const res = await fetch(imageUrl);
  const blob = await res.blob();

  // Step 2: Upload to Publisher
  const uploadRes = await fetch(`${WALRUS_PUBLISHER_URL}/v1/blobs`, {
    method: "PUT",
    body: blob,
  });

  const data = await uploadRes.json();
  console.log("Uploaded:", data);
  return data;
}

export async function getImageFromId(
  id = "YT3bqn1jMU2IdiZ35wYG1LkXt36zLEpg26YNO1f67AE"
) {
  const res = await fetch(`${WALRUS_AGGREGATOR_URL}/v1/blobs/${id}`);

  const blob = await res.blob();
  console.log("Fetched Blob:", blob);
  return URL.createObjectURL(blob);
}

/*
{
    "blobObject": {
        "id": "0x0e149f7e080b400f84a4a3600ff69c03ee450c622d77466225311b65e15feb74",
        "registeredEpoch": 231,
        "blobId": "YT3bqn1jMU2IdiZ35wYG1LkXt36zLEpg26YNO1f67AE",
        "size": 7568,
        "encodingType": "RS2",
        "certifiedEpoch": null,
        "storage": {
            "id": "0x48f036bf02fc9847b919eaf7a4fe73fa40371af67795f1e814577cf85aaeada5",
            "startEpoch": 231,
            "endEpoch": 232,
            "storageSize": 66034000
        },
        "deletable": true
    },
    "resourceOperation": {
        "registerFromScratch": {
            "encodedLength": 66034000,
            "epochsAhead": 1
        }
    },
    "cost": 11025000
}
*/
