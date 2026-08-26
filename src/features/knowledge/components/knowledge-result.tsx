import { BookOpen } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { KnowledgeOutput } from "@/lib/ai/validators/knowledge";

const EVIDENCE_STATUS_BADGE = {
  SUFICIENTE: "completed",
  PARCIAL: "pending",
  INSUFICIENTE: "attention",
  CONFLITANTE: "failed",
} as const;

export function KnowledgeResult({
  content,
  question,
}: {
  content: KnowledgeOutput;
  question?: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      {question ? (
        <p className="border-l-2 border-primary pl-3 font-serif text-sm italic text-foreground">
          {question}
        </p>
      ) : null}

      <StatusBadge
        status={EVIDENCE_STATUS_BADGE[content.evidenceStatus]}
        label={`Evidência: ${content.evidenceStatus}`}
      />

      <div>
        <span className="text-xs font-bold uppercase text-muted-foreground">Resposta direta</span>
        <p className="mt-1 text-foreground">{content.directAnswer}</p>
      </div>

      <div>
        <span className="text-xs font-bold uppercase text-muted-foreground">Síntese</span>
        <p className="mt-1 text-foreground">{content.synthesis}</p>
      </div>

      {content.citations.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Fontes citadas nesta resposta
          </span>
          {content.citations.map((citation, index) => (
            <div
              key={`${citation.sourceId}-${index}`}
              className="flex gap-3 rounded-2xl border border-border bg-surface/40 p-3 text-sm"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage-light/40 text-primary">
                <BookOpen className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <span className="block font-semibold text-foreground">
                  {citation.title ?? citation.sourceId}
                </span>
                {citation.location ? (
                  <span className="text-xs text-muted-foreground">{citation.location}</span>
                ) : null}
                <p className="mt-1 text-muted-foreground">{citation.supportedClaim}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {content.sourceAppraisal.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Papel das fontes
          </span>
          {content.sourceAppraisal.map((item) => (
            <p key={item.sourceId} className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{item.sourceRole}</span>
              {" — "}
              {item.roleInAnswer}
              {item.appraisalLimits.length > 0
                ? ` (${item.appraisalLimits.join("; ")})`
                : ""}
            </p>
          ))}
        </div>
      ) : null}

      {content.disagreements.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">Divergências</span>
          {content.disagreements.map((disagreement, index) => (
            <div key={index} className="text-sm text-foreground">
              <span className="font-semibold">{disagreement.topic}</span>
              <ul className="list-disc pl-5 text-muted-foreground">
                {disagreement.positions.map((position, posIndex) => (
                  <li key={posIndex}>{position.position}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {content.clinicalApplicability.enabled ? (
        <div className="rounded-xl border border-attention/30 bg-attention-bg/40 p-3 text-sm">
          <span className="text-xs font-bold uppercase text-attention">Aplicação ao caso</span>
          <p className="text-foreground">{content.clinicalApplicability.text}</p>
        </div>
      ) : null}

      {content.limitations.length > 0 ? (
        <div>
          <span className="text-xs font-bold uppercase text-muted-foreground">Limitações</span>
          <p className="text-sm text-muted-foreground">{content.limitations.join("; ")}</p>
        </div>
      ) : null}

      {content.nextQuestions.length > 0 ? (
        <div>
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Para aprofundar
          </span>
          <ul className="list-disc pl-5 text-sm text-foreground">
            {content.nextQuestions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
