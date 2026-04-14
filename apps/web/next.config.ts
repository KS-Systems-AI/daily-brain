import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@daily-brain/core'],
  typedRoutes: true,
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
