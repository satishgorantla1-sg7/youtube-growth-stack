import Link from "next/link";
import { Youtube } from "lucide-react";

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link href="/" className="auth-brand"><span className="brand-mark"><Youtube size={22} fill="currentColor" /></span> Growth Stack</Link>
        <p className="eyebrow">Creator workspace</p>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
    </main>
  );
}
