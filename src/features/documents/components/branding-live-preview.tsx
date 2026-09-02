"use client";

import { useEffect, useRef, useState } from "react";
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  brandingFontFamily,
  buildLetterheadFooterLines,
  buildLetterheadHeaderLines,
  letterheadDividerThickness,
  letterheadMargins,
} from "@/features/documents/branding-layout";
import { logoMaxHeightPt, type ResolvedBranding } from "@/features/documents/branding-resolve";
import { cn } from "@/lib/utils/cn";

const SAMPLE_TITLE = "DECLARAÇÃO";
const SAMPLE_BODY =
  "Declaramos, para os devidos fins, que a pessoa atendida compareceu a sessão de acompanhamento psicológico nesta data, no horário combinado, em caráter meramente ilustrativo.";
const SAMPLE_NOTE =
  "Este é um exemplo de documento. Nenhuma informação de paciente é utilizada nesta prévia.";

export function BrandingLivePreview({
  branding,
  logoUrl,
  className,
}: {
  branding: ResolvedBranding;
  logoUrl?: string | null;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.52);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(Math.min(1, width / A4_WIDTH_PT));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const box = letterheadMargins("tradicional", branding.letterhead, false);
  const fonts = brandingFontFamily(branding.typography);
  const headerLines = buildLetterheadHeaderLines(branding);
  const footerLines = buildLetterheadFooterLines(branding, {
    pageIndex: 0,
    pageCount: 1,
    documentId: "local",
    version: 1,
  });
  const logoHeight = logoMaxHeightPt("medium");
  const showLogo = Boolean(logoUrl && branding.header.logo);
  const dividerPt = Math.max(letterheadDividerThickness(branding.letterhead), 0.8);

  return (
    <div ref={wrapRef} className={cn("w-full", className)}>
      <div
        className="relative mx-auto"
        style={{ width: A4_WIDTH_PT * scale, height: A4_HEIGHT_PT * scale }}
      >
        <article
          data-testid="branding-a4-page"
          aria-label="Prévia A4 de documento"
          className="absolute left-0 top-0 origin-top-left overflow-hidden bg-white text-[#171816] shadow-[0_18px_50px_rgba(40,36,32,0.18)]"
          style={{
            width: A4_WIDTH_PT,
            height: A4_HEIGHT_PT,
            transform: `scale(${scale})`,
            fontFamily: fonts.body,
          }}
        >
          <div
            className="flex h-full flex-col"
            style={{
              paddingTop: box.top,
              paddingBottom: box.bottom,
              paddingLeft: box.left,
              paddingRight: box.right,
            }}
          >
            <header className="shrink-0">
              <div className="flex items-start gap-3">
                {showLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl ?? ""}
                    alt="Logo da identidade visual"
                    style={{
                      maxHeight: logoHeight,
                      maxWidth: 180,
                      objectFit: "contain",
                    }}
                  />
                ) : null}
                <div className="min-w-0 flex-1" style={{ fontFamily: fonts.heading }}>
                  {headerLines.map((line) => (
                    <p
                      key={`${line.text}-${line.size}`}
                      style={{
                        color: branding.colors.headings,
                        fontSize: line.size,
                        fontWeight: line.weight === "bold" ? 700 : 400,
                        lineHeight: 1.25,
                        margin: "0 0 3px",
                      }}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              </div>
              <div
                className="mt-2"
                style={{
                  height: dividerPt,
                  background: branding.colors.dividers,
                }}
              />
            </header>

            <div className="mt-8 min-h-0 flex-1">
              <p
                className="tracking-[0.14em]"
                style={{
                  color: branding.colors.primary,
                  fontFamily: fonts.heading,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  margin: 0,
                }}
              >
                {SAMPLE_TITLE}
              </p>
              <p
                style={{
                  fontSize: 11,
                  lineHeight: "16px",
                  marginTop: 16,
                  color: "#1f1f1d",
                }}
              >
                {SAMPLE_BODY}
              </p>
              <p
                style={{
                  fontSize: 10,
                  lineHeight: "15px",
                  marginTop: 18,
                  color: branding.colors.secondary,
                }}
              >
                {SAMPLE_NOTE}
              </p>
                  {branding.cityState ? (
                <p
                  style={{
                    fontSize: 10,
                    marginTop: 28,
                    color: "#1f1f1d",
                  }}
                >
                  {branding.cityState}
                </p>
              ) : null}
            </div>

            <footer className="shrink-0 pt-3">
              <div
                className="mb-2"
                style={{
                  height: 0.8,
                  background: branding.colors.dividers,
                }}
              />
              {footerLines.map((line) => (
                <p
                  key={line}
                  style={{
                    color: branding.colors.secondary,
                    fontSize: 8,
                    lineHeight: "10px",
                    margin: "0 0 2px",
                    textAlign: "center",
                  }}
                >
                  {line}
                </p>
              ))}
            </footer>
          </div>
        </article>
      </div>
    </div>
  );
}
