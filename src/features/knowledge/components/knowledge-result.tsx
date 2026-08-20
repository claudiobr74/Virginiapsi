import { StatusBadge } from "@/components/ui/status-badge";
import type { KnowledgeOutput } from "@/lib/ai/validators/knowledge";

const EVIDENCE_STATUS_BADGE = {
  SUFICIENTE: "completed",
  PARCIAL: "pending",
  INSUFICIENTE: "attention",
  CONFLITANTE: "failed",
} as const;

export function KnowledgeResult({ content }: { content: KnowledgeOutput }) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6">
      <StatusBadge
        status={EVIDENCE_STATUS_BADGE[content.evidenceStatus]}
        label={`Evidência: ${content.evidenceStatus}`}
      />

      <div>
        <span className="text-xs font-bold uppercase text-muted-foreground">Resposta direta</span>
        <p className="text-foreground">{content.directAnswer}</p>
      </div>

      <div>
        <span className="text-xs font-bold uppercase text-muted-foreground">Síntese</span>
        <p className="text-foreground">{content.synthesis}</p>
      </div>

      {content.citations.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">Citações</span>
          {content.citations.map((citation, index) => (
            <div
              key={index}
              className="rounded-xl border border-border bg-surface/40 p-3 text-sm"
            >
              <span className="font-semibold text-foreground">
                {citation.title ?? citation.sourceId}
              </span>
              {citation.location ? (
                <span className="text-xs text-muted-foreground"> — {citation.location}</span>
              ) : null}
              <p className="text-muted-foreground">{citation.supportedClaim}</p>
            </div>
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
            {content.nextQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
