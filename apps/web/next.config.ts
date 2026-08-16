import type { NextConfig } from 'next';


/** Extract a hostname from a URL-ish env value, ignoring blanks/garbage. */
function hostnameOf(value: string | undefined): string | null {
  if (!value) return null;
  const candidate = value.startsWith('http') ? value : `https://${value}`;
  try {
    return new URL(candidate).hostname;
  } catch {
    return null;
  }
}

const s3Host = hostnameOf(process.env.S3_PUBLIC_BASE_URL);
const cloudfrontHost = hostnameOf(process.env.CLOUDFRONT_DOMAIN);

const remotePatterns: NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> = [
  { protocol: 'https', hostname: 'picsum.photos', pathname: '/**' },
  { protocol: 'https', hostname: 'fastly.picsum.photos', pathname: '/**' },
  { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
  // Covers `<bucket>.s3.amazonaws.com` and `<bucket>.s3.<region>.amazonaws.com`.
  { protocol: 'https', hostname: '**.amazonaws.com', pathname: '/**' },
  { protocol: 'https', hostname: '**.cloudfront.net', pathname: '/**' },
];

for (const host of [s3Host, cloudfrontHost]) {
  if (host && !remotePatterns.some((pattern) => pattern.hostname === host)) {
    remotePatterns.push({ protocol: 'https', hostname: host, pathname: '/**' });
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,

  images: {
    remotePatterns,
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 480, 640, 828, 1080, 1200, 1600, 1920],
    imageSizes: [64, 96, 128, 192, 256, 384],
  },

  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },

  eslint: {
    // Lint is a separate CI step (`npm run lint`) — never block a container build on it.
    ignoreDuringBuilds: true,
  },

  /**
   * `/api/*` is proxied by the route handler at `src/app/api/[...path]/route.ts`,
   * not by a rewrite. `rewrites()` runs at build time and freezes its
   * destinations into routes-manifest.json, which baked `http://localhost:<port>`
   * into every container image. The handler reads the service URLs per request
   * instead, so one image works in every environment.
   */

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
