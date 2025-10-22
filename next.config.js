/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
      externalPackages: ['@prisma/client', 'bcryptjs', 'next-auth'],
    },
  },
};

module.exports = nextConfig;
