import { Link, Outlet } from 'react-router';
import { Button } from '@cangyun-ai/ui/components/ui/button';

export function RootLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-neutral-900 text-neutral-50 antialiased">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link
            to="/"
            className="flex-shrink-0 text-lg font-semibold tracking-tight text-white"
          >
            Cangyun
          </Link>
          <nav className="flex flex-shrink-0 items-center gap-3 text-xs font-medium text-neutral-300 sm:gap-4">
            <Link to="/" className="transition hover:text-white">
              方案
            </Link>
            <Link to="/chat" className="transition hover:text-white">
              对话助手
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-shrink-0 border-white/20 bg-white/10 text-xs text-neutral-100 hover:bg-white/20"
              asChild
            >
              <a
                href="https://github.com/jimmfly/cangyun"
                target="_blank"
                rel="noreferrer"
              >
                仓库
              </a>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex h-[calc(100vh-60px)] w-full max-w-5xl flex-1 overflow-hidden px-0">
        <Outlet />
      </main>

      <footer className="hidden border-t border-white/10 bg-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-6 text-xs text-neutral-400">
          <p>
            © {new Date().getFullYear()} Cangyun AI · Multi-Modal RAG Console
          </p>
          <p>Streaming Retrieval · NestJS Orchestration</p>
        </div>
      </footer>
    </div>
  );
}
