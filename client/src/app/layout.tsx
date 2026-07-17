import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "今日头条 - AI创作者辅助生产与分发平台",
    description: "AI创作者辅助生产与分发平台，一站式AI内容创作、智能审核与分发",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="zh-CN" className="h-full antialiased">
            <body className="min-h-full flex flex-col">{children}</body>
        </html>
    );
}
