import type { ReactNode } from "react";

import { Logo } from "./icons";

interface Props {
  title: string;
  subtitle: string;
  footer: ReactNode;
  children: ReactNode;
}

export default function AuthLayout({ title, subtitle, footer, children }: Props) {
  return (
    <div className="auth-page">
      <svg
        className="auth-doodles"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <rect x="90" y="120" width="190" height="120" rx="14" transform="rotate(-6 185 180)" />
        <circle cx="1040" cy="170" r="70" />
        <path d="M130 620c60-50 120 40 190-10s110-60 160 0" />
        <path d="M900 640 1060 560" />
        <path d="m1030 552 30 8-12 28" />
        <rect x="960" y="380" width="120" height="80" rx="12" transform="rotate(8 1020 420)" />
      </svg>

      <main className="auth-card">
        <Logo />

        <div className="auth-head">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        {children}

        <p className="auth-footer">{footer}</p>
      </main>
    </div>
  );
}
