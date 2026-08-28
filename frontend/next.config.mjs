/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8002";

    return {
      fallback: [
        {
          source: "/ch/:path*",
          destination: `${apiBase}/ch/:path*`,
        },
      ],
    };
  },
}

export default nextConfig
