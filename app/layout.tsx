import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: {
      default: "CourseTrack",
      template: "%s | CourseTrack",
    },
    description:
      "Search, explore, and manage an internal portfolio of public-safety courses with clear LMS provenance.",
    icons: {
      icon: "/favicon.png",
      shortcut: "/favicon.png",
    },
    openGraph: {
      title: "CourseTrack",
      description: "Search. Explore. Manage.",
      type: "website",
      url: metadataBase,
      images: [
        {
          url: new URL("/og.png", metadataBase),
          width: 1200,
          height: 630,
          alt: "CourseTrack — Search. Explore. Manage.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "CourseTrack",
      description: "Search. Explore. Manage.",
      images: [new URL("/og.png", metadataBase)],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
