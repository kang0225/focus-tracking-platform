import type { NextConfig } from "next";

const nextConfig = {
  transpilePackages: [
    '@tensorflow-models/face-landmarks-detection',
    '@mediapipe/face_mesh',
    'webgazer'
  ],
};

export default nextConfig;
