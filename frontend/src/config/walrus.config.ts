import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { getFullnodeUrl } from "@mysten/sui/client";
import { walrus } from "@mysten/walrus";

export const client = new SuiJsonRpcClient({
  url: getFullnodeUrl("testnet"),
  // Setting network on your client is required for walrus to work correctly
  network: "testnet",
}).$extend(walrus());
