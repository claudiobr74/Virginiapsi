# Auditoria de nomenclatura legado

Marca visível atual: **VirgíniaPsi**. Identificadores internos históricos (Tesseli / `tesseli_*`) **não** foram renomeados neste ciclo quando a troca quebraria migrations, cookies, Storage, auditoria, URLs ou compatibilidade.

Classificação:

| Identificador | Onde | Classe | Motivo |
|---|---|---|---|
| `tesseli-theme` | cookie / `ThemeProvider` `storageKey` | KEEP_INTERNAL | Cookie de preferência já persistido nos browsers. |
| `appointment_origin = 'TESSELI'` | enum Postgres + TS | KEEP_INTERNAL / REQUIRES_MIGRATION | Valor de enum em produção; rename exige migration + backfill + clientes. |
| `managed_by_tesseli` | coluna `appointments` | REQUIRES_MIGRATION | Coluna persistida. |
| `tesseli_app_url` / `tesseli_cron_secret` | Supabase Vault | KEEP_INTERNAL | Jobs `pg_cron` já referenciam esses nomes. |
| `tesseli.append_artifact` | `set_config` na RPC de artefato | KEEP_INTERNAL | Setting de transação; rename quebraria o trigger. |
| package `name: "tesseli"` | `package.json` | KEEP_INTERNAL | Identidade do pacote Node; não é marca de UI. |
| `tesseli_test` / `tesseli_admin` / `tesseli_authenticator` | DB local de testes | KEEP_INTERNAL | Ambiente CI/local. |
| buckets `tesseli-exports` | Storage | REQUIRES_MIGRATION | Path físico; rename move objetos. |
| jobs `tesseli-whatsapp-reminders` / `tesseli-audio-retention` | `pg_cron` | KEEP_INTERNAL | Nomes de job já agendados. |
| `MODO: CONHECIMENTO TESSELI` | runtime prompt | KEEP_INTERNAL | Texto de atuação da IA; fonte de verdade em `src/lib/ai/prompts`. |
| UI “VirgíniaPsi” | layout, metadata, PDFs | SAFE_TO_RENAME (já feito) | Marca visível. |
| SerenaPsi / Serenità na UI | `src/` | SAFE_TO_RENAME (ausente) | Nenhuma ocorrência na interface. |
| SerenaPsi em docs históricas | `docs/26-go-live.md` | KEEP_INTERNAL | Relato de inventário G0 (URLs/repos antigos). |
| Figma “Serenità” | `docs/02-visual-spec.md` | KEEP_INTERNAL | Nome do arquivo de design de origem. |

Nenhuma rename automática destrutiva foi aplicada neste ciclo.
