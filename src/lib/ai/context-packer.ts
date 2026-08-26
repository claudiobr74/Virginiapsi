interface ContextBlock {
  label: string;
  value: unknown;
}

/**
 * Renders minimized, labeled context blocks (docs/14-runtime-ai-architecture.md
 * §6, docs/16-runtime-ai-data-contracts.md "Autoridade dos dados"). Blocks
 * with no value are omitted entirely rather than sent empty — "campos
 * contextuais devem ser enviados somente quando relevantes e autorizados".
 * Delimiters are inert data labels; nothing inside them can climb the
 * instruction hierarchy above the system/runtime prompt (docs/14 §5).
 *
 * Shared by every runtime-AI feature (Session AI, Supervisor, and — once
 * built — Knowledge) so the delimiter vocabulary and omission rule never
 * drift between them.
 */
export function packContext(blocks: ContextBlock[]): string {
  return blocks
    .filter(({ value }) => value !== undefined && value !== null && value !== "")
    .map(({ label, value }) => {
      const rendered = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      return `[${label}]\n${rendered}`;
    })
    .join("\n\n");
}
