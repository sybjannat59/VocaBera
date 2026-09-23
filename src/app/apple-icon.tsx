import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/icon-art";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // iOS adds its own rounded mask, so use the full-bleed variant.
  return new ImageResponse(<IconArt size={180} maskable />, size);
}
