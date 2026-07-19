import type { NextConfig } from "next";

const serverPort = process.env.Server_Port || "4001";
// macOS 上部分桌面应用可能占用同端口的 IPv4 地址；后端当前监听 IPv6，
// 使用 localhost 可避免请求误入 127.0.0.1 上的其他进程。
const apiServer = `http://localhost:${serverPort}`;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiServer}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${apiServer}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
