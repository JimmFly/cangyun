import { Link, Outlet } from 'react-router';
import { Button } from '../../components/ui/button';

export function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Cangyun Console
          </Link>
          <nav className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <Link to="/" className="transition hover:text-foreground">
              首页
            </Link>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://reactrouter.com"
                target="_blank"
                rel="noreferrer"
              >
                React Router 文档
              </a>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 px-6 py-16">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Cangyun AI</p>
          <p>Declarative Routing · React Router v7</p>
        </div>
      </footer>
    </div>
  );
}
