import { API_IMAGE_GEN_URL } from "../constants";

export const fetchImage = async (): Promise<string> => {
  const response = await fetch(API_IMAGE_GEN_URL);
  if (!response.ok) {
    throw new Error("Failed to fetch image");
  }
  return response.url;
};
