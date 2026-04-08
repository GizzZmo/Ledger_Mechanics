/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Allow the dashboard to be served from a sub-path (e.g. /dashboard)
  // Set BASE_PATH env var at build time to activate.
  basePath: process.env.BASE_PATH || "",

  // Expose public env vars to the browser
  env: {
    NEXT_PUBLIC_LEDGER_ADDRESS:   process.env.NEXT_PUBLIC_LEDGER_ADDRESS   || "",
    NEXT_PUBLIC_AURA_ADDRESS:     process.env.NEXT_PUBLIC_AURA_ADDRESS     || "",
    NEXT_PUBLIC_RPC_URL:          process.env.NEXT_PUBLIC_RPC_URL          || "http://127.0.0.1:8545",
    NEXT_PUBLIC_NODE_API_URL:     process.env.NEXT_PUBLIC_NODE_API_URL     || "http://127.0.0.1:8080",
    NEXT_PUBLIC_CHAIN_ID:         process.env.NEXT_PUBLIC_CHAIN_ID         || "31337",
  },

  // Webpack — needed for ethers.js in browser bundles
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs:   false,
        net:  false,
        tls:  false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
