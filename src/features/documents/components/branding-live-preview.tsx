"use client";

import { useEffect, useRef, useState } from "react";
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  brandingFontFamily,
  buildLetterheadFooterLines,
  buildLetterheadHeaderLines,
  getVisualProfileLayout,
} from "@/features/documents/branding-layout";
import type { ResolvedBranding } from "@/features/documents/branding-resolve";
import { cn } from "@/lib/utils/cn";

const SAMPLE_BODY =
  "Declaro, para os devidos fins, que a pessoa atendida compareceu a acompanhamento psicológico nesta data, no horário combinado.";
const SAMPLE_PURPOSE =
  "Documento demonstrativo destinado exclusivamente à visualização da identidade gráfica.";

function Divider({ branding }: { branding: ResolvedBranding }) {
  const layout = getVisualProfileLayout(branding.visualProfile);
  if (layout.divider === "none") return <div className="h-4" />;
  const height = layout.divider === "strong" ? 1.5 : layout.divider === "hairline" ? 0.55 : 0.9;
  return (
    <div className={cn("mt-3", layout.dividerWidth === "short" ? "mx-auto w-2/5" : "w-full")}>
      <div style={{ height, background: branding.colors.dividers }} />
    </div>
  );
}

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

  const layout = getVisualProfileLayout(branding.visualProfile);
  const fonts = brandingFontFamily(branding.typography);
  const headerLines = buildLetterheadHeaderLines(branding);
  const footerLines = buildLetterheadFooterLines(branding, {
    pageIndex: 0,
    pageCount: 1,
    documentId: "local",
    version: 1,
  });
  const showLogo = Boolean(logoUrl && branding.header.logo);
  const bodyWidth = `${Math.round(layout.bodyMaxWidthRatio * 100)}%`;
  const headerCentered = layout.headerAlignment === "center";
  const logoCentered = layout.logoAlignment === "center";
  const titleCentered = layout.titleAlignment === "center";
  const signatureCrp = branding.header.crp ? branding.crpLabel || "CRP 00/00000" : "";

  return (
    <div ref={wrapRef} className={cn("w-full", className)}>
      <div
        className="relative mx-auto"
        style={{ width: A4_WIDTH_PT * scale, height: A4_HEIGHT_PT * scale }}
      >
        <article
          data-testid="branding-a4-page"
          data-visual-profile={branding.visualProfile}
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
              paddingTop: layout.margins.top,
              paddingBottom: layout.margins.bottom,
              paddingLeft: layout.margins.left,
              paddingRight: layout.margins.right,
            }}
          >
            <header
              className={cn(
                "shrink-0",
                headerCentered ? "text-center" : "text-left",
                layout.headerComposition === "institutional" ? "min-h-[78px]" : null,
              )}
            >
              <div
                className={cn(
                  "gap-4",
                  logoCentered ? "flex flex-col items-center" : "flex items-start",
                )}
              >
                {showLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl ?? ""}
                    alt="Logo da identidade visual"
                    style={{
                      maxHeight: layout.logoMaxHeightPt,
                      maxWidth: logoCentered ? 190 : 150,
                      objectFit: "contain",
                    }}
                  />
                ) : null}
                <div
                  className={cn("min-w-0", logoCentered ? "w-full" : "flex-1")}
                  style={{ fontFamily: fonts.heading }}
                >
                  {headerLines.map((line, index) => (
                    <p
                      key={`${line.text}-${line.size}-${index}`}
                      style={{
                        color: branding.colors.headings,
                        fontSize: line.size,
                        fontWeight: line.weight === "bold" ? 700 : 400,
                        lineHeight: 1.25,
                        margin: "0 0 3px",
                        letterSpacing:
                          branding.visualProfile === "premium" && index === 1 ? "0.04em" : undefined,
                      }}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              </div>
              <Divider branding={branding} />
            </header>

            <main
              className={cn("min-h-0 flex-1", titleCentered ? "text-center" : "text-left")}
              style={{
                marginTop: branding.visualProfile === "essencial" ? 34 : branding.visualProfile === "premium" ? 40 : 28,
              }}
            >
              <div className="mx-auto" style={{ width: bodyWidth }}>
                <p
                  data-testid="branding-preview-title"
                  style={{
                    color: branding.colors.primary,
                    fontFamily: fonts.heading,
                    fontSize: layout.titleSizePt,
                    fontWeight: 700,
                    letterSpacing: `${layout.titleTrackingEm}em`,
                    margin: 0,
                    textAlign: layout.titleAlignment,
                  }}
                >
                  DECLARAÇÃO
                </p>

                <div
                  style={{
                    marginTop: branding.visualProfile === "premium" ? 26 : 20,
                    textAlign: "left",
                    fontSize: layout.bodySizePt,
                    lineHeight: `${layout.bodyLineHeightPt}px`,
                    color: "#1f1f1d",
                  }}
                >
                  <p style={{ margin: 0 }}>{SAMPLE_BODY}</p>
                  <p
                    style={{
                      marginTop: branding.visualProfile === "essencial" ? 26 : 22,
                      marginBottom: 6,
                      fontFamily: fonts.heading,
                      fontWeight: 700,
                      color: branding.colors.headings,
                    }}
                  >
                    Finalidade
                  </p>
                  <p style={{ margin: 0 }}>{SAMPLE_PURPOSE}</p>
                </div>

                <p
                  style={{
                    fontSize: 10,
                    marginTop: branding.visualProfile === "premium" ? 38 : 30,
                    color: "#1f1f1d",
                    textAlign: branding.visualProfile === "premium" ? "center" : "left",
                  }}
                >
                  {branding.cityState ? `${branding.cityState}, ` : "Goiânia, "}2 de setembro de 2026.
                </p>

                <div
                  data-testid="branding-preview-signature"
                  style={{
                    marginTop: branding.visualProfile === "essencial" ? 52 : 42,
                    marginLeft: layout.signatureAlignment === "right" ? "auto" : undefined,
                    marginRight: layout.signatureAlignment === "left" ? "auto" : undefined,
                    width: layout.signatureAlignment === "center" ? "58%" : "52%",
                    textAlign: layout.signatureAlignment,
                    color: "#1f1f1d",
                  }}
                >
                  {branding.visualProfile !== "essencial" ? (
                    <div
                      style={{
                        height: 0.7,
                        background: branding.colors.dividers,
                        marginBottom: 8,
                      }}
                    />
                  ) : null}
                  <p style={{ margin: 0, fontFamily: fonts.heading, fontSize: 10.5, fontWeight: 700 }}>
                    {branding.professionalName || "Virginia Exemplo"}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 9, color: branding.colors.secondary }}>
                    {branding.professionalTitle || "Psicóloga"}
                    {signatureCrp ? ` · ${signatureCrp}` : ""}
                  </p>
                </div>
              </div>
            </main>

            <footer className="shrink-0 pt-3">
              {branding.visualProfile !== "essencial" ? (
                <div
                  className={cn("mb-2", branding.visualProfile === "premium" ? "mx-auto w-2/5" : "w-full")}
                  style={{ height: 0.6, background: branding.colors.dividers }}
                />
              ) : null}
              {footerLines.map((line) => (
                <p
                  key={line}
                  style={{
                    color: branding.colors.secondary,
                    fontSize: branding.visualProfile === "institucional" ? 8.2 : 8,
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
