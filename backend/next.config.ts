import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['onnxruntime-node'],
  transpilePackages: [
    '@tensorflow-models/face-landmarks-detection',
    '@mediapipe/face_mesh',
    'webgazer'
  ],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
