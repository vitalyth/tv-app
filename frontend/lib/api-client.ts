import { api } from "./api";

export const apiFetch = async (
  path: string,
  options?: RequestInit
) => {
  const res = await fetch(api(path), options);

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
};