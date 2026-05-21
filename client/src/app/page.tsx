import Image from "next/image";

export default function Home() {
	return (
		<main className="min-h-screen bg-background">
			{/* <Header /> */}

			{/* 为固定导航留出空间 */}
			{/* <div className="pt-12">
				<HeroSection />
				<ContentSection />
			</div> */}

			{/* 底部 */}
			<footer className="border-t mt-8 py-8 bg-muted/30">
				<div className="max-w-[1400px] mx-auto px-4">
					<div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
						<a href="#" className="hover:text-foreground transition-colors">加入头条</a>
						<a href="#" className="hover:text-foreground transition-colors">用户协议</a>
						<a href="#" className="hover:text-foreground transition-colors">隐私政策</a>
						<a href="#" className="hover:text-foreground transition-colors">媒体合作</a>
						<a href="#" className="hover:text-foreground transition-colors">广告合作</a>
						<a href="#" className="hover:text-foreground transition-colors">友情链接</a>
						<a href="#" className="hover:text-foreground transition-colors">更多</a>
						<a href="#" className="hover:text-foreground transition-colors">下载今日头条APP</a>
					</div>
					<div className="text-center mt-4 text-xs text-muted-foreground">
						<p>北京科创信息服务有限公司 | 400-140-2108</p>
						<p className="mt-1">违法和不良信息举报 | 京ICP备12025439号</p>
					</div>
				</div>
			</footer>
		</main>
	);
}
