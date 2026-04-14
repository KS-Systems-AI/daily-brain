import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@daily-brain/core'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

export default nextConfig
