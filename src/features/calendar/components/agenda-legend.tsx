import { CALENDAR_LEGEND_ITEMS, legendDotClass } from "@/features/calendar/event-appearance";

export function AgendaLegend() {
  return (
    <ul
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
      aria-label="Legenda da agenda"
    >
      {CALENDAR_LEGEND_ITEMS.map((item) => (
        <li key={item.tone} className="inline-flex items-center gap-1.5">
          <span
            className={`size-2 rounded-full ${legendDotClass(item.tone)}`}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
