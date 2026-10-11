import { Send } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground warm-shadow-md">
            <Send className="h-6 w-6" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">
            Wu Wei Mail
          </span>
          <span className="text-xs text-muted-foreground">
            Effortless cold email outreach
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
