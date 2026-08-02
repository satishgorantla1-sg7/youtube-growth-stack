import type { Metadata } from "next";
import "./globals.css";
import "./workspace-routes.css";
import "./workspace-accessibility.css";
import "./youtube-settings.css";
import "./youtube-approval.css";

export const metadata: Metadata = {
  title: "YouTube Growth Stack",
  description: "A voice-first research and content strategy workspace for YouTube creators.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
