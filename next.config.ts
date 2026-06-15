import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 開発時は画像最適化キャッシュ（.next/cache/images）を通さず
    // public/ から直接配信し、画像を上書きしたら即反映されるようにする。
    // 本番（next build / start）では従来どおり最適化を有効にする。
    unoptimized: process.env.NODE_ENV === "development",
  },
};

export default nextConfig;
