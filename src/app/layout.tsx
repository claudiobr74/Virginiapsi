import type { Metadata } from "next";
import { fontMono, fontSans, fontSerif } from "@/lib/fonts";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
import "./appearance-presets.css";
import "./appearance-preset-previews.css";

export const metadata: Metadata = {
  title: "VirgíniaPsi",
  description: "Gestão de consultório de psicologia",
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#131412" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="tesseli-theme"
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
