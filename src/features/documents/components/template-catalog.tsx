"use client";

import { FileText, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { SearchField } from "@/components/ui/search-field";
import { ToneIcon } from "@/components/ui/tone-icon";
import {
  searchSystemTemplates,
  TEMPLATE_CATEGORY_LABELS,
  type SystemTemplateCategory,
  type SystemTemplateDefinition,
} from "@/features/documents/system-templates";
import { cn } from "@/lib/utils/cn";

const CATEGORY_ORDER: SystemTemplateCategory[] = [
  "declaracoes",
  "atestados",
  "relatorios",
  "avaliacao",
  "pareceres",
  "encaminhamentos",
  "contratos",
  "termos",
  "administrativos",
];

export function TemplateCatalog({
  favoriteKeys,
  onFavorite,
  pending = false,
  initialQuery = "",
  initialCategory,
  onSelect,
}: {
  favoriteKeys: string[];
  onFavorite: (key: string) => void;
  pending?: boolean;
  initialQuery?: string;
  initialCategory?: SystemTemplateCategory;
  onSelect?: (template: SystemTemplateDefinition) => void;
}) {
  const [search, setSearch] = useState(initialQuery);
  const [category, setCategory] = useState<SystemTemplateCategory | "all">(initialCategory ?? "all");
  const matches = useMemo(() => searchSystemTemplates(search), [search]);
  const visible = matches.filter((template) => category === "all" || template.category === category);

  return (
    <div className="flex flex-col gap-4">
      <SearchField value={search} onChange={setSearch} placeholder="Buscar um modelo..." />
      <div className="flex flex-wrap gap-1.5">
        <CategoryChip active={category === "all"} onClick={() => setCategory("all")}>
          Todos
        </CategoryChip>
        {CATEGORY_ORDER.map((item) => (
          <CategoryChip key={item} active={category === item} onClick={() => setCategory(item)}>
            {TEMPLATE_CATEGORY_LABELS[item]}
          </CategoryChip>
        ))}
      </div>
      <div className="flex flex-col gap-6">
        {CATEGORY_ORDER.map((item) => {
          const templates = visible.filter((template) => template.category === item);
          if (templates.length === 0) return null;
          return (
            <div key={item}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {TEMPLATE_CATEGORY_LABELS[item]}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.key}
                    template={template}
                    favorite={favoriteKeys.includes(template.key)}
                    onFavorite={() => onFavorite(template.key)}
                    pending={pending}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold",
        active
          ? "border-tone-documents-border bg-tone-documents text-tone-documents-icon"
          : "border-border bg-card text-muted-foreground hover:border-primary/30",
      )}
    >
      {children}
    </button>
  );
}

export function TemplateCard({
  template,
  favorite,
  onFavorite,
  pending,
  onSelect,
}: {
  template: SystemTemplateDefinition;
  favorite: boolean;
  onFavorite: () => void;
  pending: boolean;
  onSelect?: (template: SystemTemplateDefinition) => void;
}) {
  const href = `/app/documents/new?template=${template.key}`;
  return (
    <article className="overflow-hidden rounded-[20px] border border-tone-documents-border bg-card shadow-card">
      <div className="flex items-start justify-between gap-2 border-b border-tone-documents-border bg-tone-documents px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <ToneIcon tone="documents">
            <FileText />
          </ToneIcon>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">{template.name}</h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{template.description}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={favorite ? "Remover dos favoritos" : "Favoritar"}
          disabled={pending}
          onClick={onFavorite}
          className="rounded-full p-1 text-muted-foreground hover:text-primary"
        >
          <Star className={cn("size-4", favorite && "fill-primary text-primary")} />
        </button>
      </div>
      <div className="bg-card px-4 py-3">
        {onSelect ? (
          <button
            type="button"
            className="text-xs font-semibold text-primary hover:text-primary-hover"
            onClick={() => onSelect(template)}
          >
            Usar modelo
          </button>
        ) : (
          <Link href={href} className="text-xs font-semibold text-primary hover:text-primary-hover">
            Usar modelo
          </Link>
        )}
      </div>
    </article>
  );
}
