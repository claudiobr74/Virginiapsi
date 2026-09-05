export const PRODUCT_NAME = "VirgíniaPsi";
export const PRODUCT_TAGLINE = "Consultório Digital";
export const PRODUCT_LOGIN_TAGLINE =
  "Tudo o que você precisa para cuidar dos seus pacientes.";
export const PRODUCT_LOGIN_FOOTER =
  "Acesso protegido e auditado. Em conformidade com LGPD e CFP.";

export function pageTitle(page: string): string {
  return `${page} — ${PRODUCT_NAME}`;
}

export function pageHeading(
  pathname: string,
  search?: { view?: string | null },
): string {
  if (pathname === "/app") {
    return `Hoje no ${PRODUCT_NAME}`;
  }
  if (pathname.startsWith("/app/patients/new")) {
    return "Novo paciente";
  }
  if (pathname.startsWith("/app/patients/") && pathname.endsWith("/edit")) {
    return "Editar paciente";
  }
  if (pathname.startsWith("/app/patients/")) {
    return "Prontuário do paciente";
  }
  if (pathname.startsWith("/app/patients")) {
    return "Diretório de Pacientes";
  }
  if (pathname.startsWith("/app/agenda/connect")) {
    return "Google Calendar";
  }
  if (pathname.startsWith("/app/agenda")) {
    if (search?.view === "week") {
      return "Agenda Semanal";
    }
    if (search?.view === "month") {
      return "Agenda Mensal";
    }
    return "Agenda Diária";
  }
  if (pathname.startsWith("/app/sessions")) {
    return "Sessões";
  }
  if (pathname.startsWith("/app/pendencias")) {
    return "Central de Pendências Inteligente";
  }
  if (pathname.startsWith("/app/finance")) {
    return "Financeiro";
  }
  if (pathname.startsWith("/app/knowledge")) {
    return "Conhecimento";
  }
  if (pathname.startsWith("/app/supervisor")) {
    return "Supervisor IA";
  }
  if (pathname.startsWith("/app/documents/new")) {
    return "Novo documento";
  }
  if (pathname.startsWith("/app/documents/templates")) {
    return "Modelos";
  }
  if (pathname.startsWith("/app/documents")) {
    return "Documentos";
  }
  if (pathname.startsWith("/app/indicadores")) {
    return "Indicadores e Métricas Clínicas";
  }
  if (pathname.startsWith("/app/settings")) {
    return "Configurações";
  }
  return PRODUCT_NAME;
}
