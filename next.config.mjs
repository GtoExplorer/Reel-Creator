/** @type {import('next').NextConfig} */
const nextConfig = {
  // Heavy/native server-only deps stay external — never bundled into the client
  // or edge runtime (route handlers import these via src/).
  experimental: {
    serverComponentsExternalPackages: ["playwright", "@remotion/cli", "remotion", "openai", "jose"],
  },
  webpack: (config) => {
    // src/ uses ESM ".js" import specifiers that actually point at .ts/.tsx —
    // teach webpack to resolve them (same trick as remotion.config.ts).
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
