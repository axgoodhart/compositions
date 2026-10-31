/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      { source: '/editlive.html', destination: '/editlive' }, // the editors also answer to .html addresses
      { source: '/edit.html', destination: '/edit' },
    ]
  },
}

export default nextConfig
