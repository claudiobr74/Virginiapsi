# Fase 12 — Configurações, Diagnósticos e Portabilidade

Use `/feature-slice`.

Implemente Central de Configurações fiel:
- Meu Perfil;
- Consultório;
- Aparência;
- Segurança;
- Equipe e Acessos;
- Integrações;
- Backup e Recuperação;
- Zona de Risco.

Integrações mostram status real para Google, Twilio, transcrição (local e fallback) e Gemini sem revelar secrets.

Backup: documentar backup da plataforma Supabase e implementar exportação lógica/portabilidade SerenaPsi sem Google Drive.

Gate: permission matrix + secret leakage + destructive confirmation + export consistency. Pare.
