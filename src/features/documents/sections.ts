import type { DocumentSection } from "@/features/documents/contracts";

export function sectionsToBody(sections: DocumentSection[]): string {
  return [...sections]
    .filter((section) => section.enabled)
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      if (section.type === "page_break") {
        return "[page-break]";
      }
      const heading = section.title.trim() ? `# ${section.title.trim()}\n\n` : "";
      return `${heading}${section.content.trim()}`;
    })
    .join("\n\n");
}

export function cloneSections(sections: DocumentSection[]): DocumentSection[] {
  return sections.map((section) => ({ ...section }));
}

export function sortSections(sections: DocumentSection[]): DocumentSection[] {
  return [...sections].sort((a, b) => a.order - b.order).map((section, index) => ({
    ...section,
    order: index,
  }));
}

export function createSection(input: {
  type: DocumentSection["type"];
  title?: string;
  content?: string;
  order: number;
  pageBreakBefore?: boolean;
}): DocumentSection {
  return {
    id: crypto.randomUUID(),
    type: input.type,
    title: input.title ?? "",
    content: input.content ?? "",
    order: input.order,
    enabled: true,
    pageBreakBefore: input.pageBreakBefore ?? input.type === "page_break",
  };
}

export function moveSection(
  sections: DocumentSection[],
  id: string,
  direction: "up" | "down",
): DocumentSection[] {
  const sorted = sortSections(sections);
  const index = sorted.findIndex((section) => section.id === id);
  if (index < 0) return sorted;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= sorted.length) return sorted;
  const copy = [...sorted];
  const [item] = copy.splice(index, 1);
  copy.splice(target, 0, item);
  return sortSections(copy);
}
