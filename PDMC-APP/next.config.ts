import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{source:"/:path*",headers:[
      {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"Referrer-Policy",value:"same-origin"},
      {key:"X-Frame-Options",value:"DENY"},
      {key:"Content-Security-Policy",value:"frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"},
    ]}];
  },
};

export default nextConfig;
