import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "AI创作者辅助生产与分发平台",
    description: "AI创作者辅助生产与分发平台，一站式AI内容创作、智能审核与分发",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('creator-color-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()` }} />
            </head>
            <body className="min-h-full flex flex-col">{children}</body>
        </html>
    );
}
