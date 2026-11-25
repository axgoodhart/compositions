/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    agentUpgrade: 'security',
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['192.168.4.24'],
  async headers() {
    return [
      {
        source: '/media/rooms/html/:path*',
        // Keep uploaded pages isolated when opened directly, too.
        headers: [{ key: 'Content-Security-Policy', value: 'sandbox allow-scripts' }],
      },
    ]
  },
  async rewrites() {
    return [
      { source: '/editlive.html', destination: '/editlive' }, // the editor also answers to an .html address
    ]
  },
}

export default nextConfig
