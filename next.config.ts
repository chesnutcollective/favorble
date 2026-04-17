import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Expand the list of packages Next should analyze for tree-shaking on
    // imports. Icon/UI kits re-export hundreds of symbols from a barrel file
    // — without this hint a single `import { Icon } from "@hugeicons/react"`
    // can drag the entire set into the client bundle. `date-fns` and
    // `@radix-ui/react-icons` have the same barrel-file problem. Lucide was
    // already listed; the rest are additive.
    optimizePackageImports: [
      "lucide-react",
      "@hugeicons/react",
      "@hugeicons/core-free-icons",
      "date-fns",
      "@radix-ui/react-icons",
    ],
    useCache: true,
  },
};

export default nextConfig;
