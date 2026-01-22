import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // 关键：告诉 Next.js 导出静态 HTML
  images: {
    unoptimized: true, // Electron 不支持 Next 自带的图片优化
  },
  assetPrefix: '.', // 强制使用相对路径
};

export default nextConfig;
