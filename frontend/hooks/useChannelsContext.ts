import { useContext } from "react";
import { ChannelsContext } from "@/app/live/layout";

export const useChannelsContext = () => {
  const ctx = useContext(ChannelsContext);

  if (!ctx) {
    throw new Error("must be inside provider");
  }
  
  return ctx;
};