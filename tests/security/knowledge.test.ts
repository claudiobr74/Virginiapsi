import { beforeAll, describe, expect, it } from "vitest";
import { addMember, bootstrapOrganization, createAuthUser, openSession } from "./support/db";

function fakeVector(seed: number): string {
  const values = Array.from({ length: 768 }, (_, i) => Math.sin(seed + i) * 0.01);
  return `[${values.join(",")}]`;
}

describe("knowledge_* — RLS e isolamento de tenant (Fase 8)", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Conhecimento");
    await addMember(admin, organizationId, secretary, "secretary");
  });

  it("admin cria coleção, fonte, documento, chunk e embedding em cadeia", async () => {
    const session = await openSession({ userId: admin });
    try {
      const [collection] = await session.query<{ id: string }>(
        `insert into public.knowledge_collections (organization_id, name)
         values ($1, 'TCC — Fundamentos') returning id`,
        [organizationId],
      );

      const [source] = await session.query<{ id: string; uploaded_by: string }>(
        `insert into public.knowledge_sources
           (organization_id, collection_id, title, storage_path, mime_type, byte_size, sha256)
         values ($1, $2, 'Livro X', $3, 'application/pdf', 1024, 'abc123')
         returning id, uploaded_by`,
        [organizationId, collection.id, `${organizationId}/source-1/livro.pdf`],
      );
      expect(source.uploaded_by).toBe(admin);

      const [document] = await session.query<{ id: string }>(
        `insert into public.knowledge_documents (organization_id, source_id, extracted_text, char_count)
         values ($1, $2, 'Texto extraído do livro.', 25) returning id`,
        [organizationId, source.id],
      );

      const [chunk] = await session.query<{ id: string }>(
        `insert into public.knowledge_chunks (organization_id, source_id, document_id, sequence, text)
         values ($1, $2, $3, 0, 'Texto extraído do livro.') returning id`,
        [organizationId, source.id, document.id],
      );

      const embeddingRows = await session.query(
        `insert into public.knowledge_embeddings (chunk_id, organization_id, embedding, model)
         values ($1, $2, $3, 'gemini-embedding-test') returning chunk_id`,
        [chunk.id, organizationId, fakeVector(1)],
      );
      expect(embeddingRows).toHaveLength(1);
    } finally {
      await session.close();
    }
  });

  it("secretária não lê nem escreve em nenhuma tabela do módulo", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const collections = await session.query(
        "select id from public.knowledge_collections where organization_id = $1",
        [organizationId],
      );
      expect(collections).toEqual([]);

      const error = await session.expectError(
        `insert into public.knowledge_collections (organization_id, name) values ($1, 'forjado')`,
        [organizationId],
      );
      expect(error).toMatch(/violates row-level security/i);
    } finally {
      await session.close();
    }
  });

  it("fonte de outra organização não é visível nem retornada pela busca vetorial", async () => {
    const outsider = await createAuthUser();
    const outsiderOrg = await bootstrapOrganization(outsider, "Consultório Isolado Conhecimento");

    const outsiderSession = await openSession({ userId: outsider });
    let outsiderSourceId: string;
    let outsiderChunkId: string;
    try {
      const [source] = await outsiderSession.query<{ id: string }>(
        `insert into public.knowledge_sources
           (organization_id, title, storage_path, mime_type, byte_size, sha256)
         values ($1, 'Fonte de B', $2, 'text/plain', 10, 'def456') returning id`,
        [outsiderOrg, `${outsiderOrg}/source-b/nota.txt`],
      );
      outsiderSourceId = source.id;
      const [document] = await outsiderSession.query<{ id: string }>(
        `insert into public.knowledge_documents (organization_id, source_id, extracted_text, char_count)
         values ($1, $2, 'conteúdo de B', 13) returning id`,
        [outsiderOrg, source.id],
      );
      const [chunk] = await outsiderSession.query<{ id: string }>(
        `insert into public.knowledge_chunks (organization_id, source_id, document_id, sequence, text)
         values ($1, $2, $3, 0, 'conteúdo de B') returning id`,
        [outsiderOrg, source.id, document.id],
      );
      outsiderChunkId = chunk.id;
      await outsiderSession.query(
        `insert into public.knowledge_embeddings (chunk_id, organization_id, embedding, model)
         values ($1, $2, $3, 'gemini-embedding-test')`,
        [chunk.id, outsiderOrg, fakeVector(2)],
      );
    } finally {
      await outsiderSession.close();
    }

    const adminSession = await openSession({ userId: admin });
    try {
      const rows = await adminSession.query(
        "select id from public.knowledge_sources where id = $1",
        [outsiderSourceId],
      );
      expect(rows).toEqual([]);

      const matches = await adminSession.query<{ chunk_id: string }>(
        "select * from public.match_knowledge_chunks($1, $2, 10)",
        [organizationId, fakeVector(2)],
      );
      expect(matches.some((row) => row.chunk_id === outsiderChunkId)).toBe(false);
    } finally {
      await adminSession.close();
    }
  });

  it("match_knowledge_chunks devolve os chunks mais próximos, filtrados por organização", async () => {
    const session = await openSession({ userId: admin });
    try {
      const [source] = await session.query<{ id: string }>(
        `insert into public.knowledge_sources
           (organization_id, title, storage_path, mime_type, byte_size, sha256)
         values ($1, 'Fonte Similaridade', $2, 'text/plain', 10, 'sim123') returning id`,
        [organizationId, `${organizationId}/source-sim/nota.txt`],
      );
      const [document] = await session.query<{ id: string }>(
        `insert into public.knowledge_documents (organization_id, source_id, extracted_text, char_count)
         values ($1, $2, 'x', 1) returning id`,
        [organizationId, source.id],
      );
      const closeChunk = await session.query<{ id: string }>(
        `insert into public.knowledge_chunks (organization_id, source_id, document_id, sequence, text)
         values ($1, $2, $3, 1, 'próximo') returning id`,
        [organizationId, source.id, document.id],
      );
      const farChunk = await session.query<{ id: string }>(
        `insert into public.knowledge_chunks (organization_id, source_id, document_id, sequence, text)
         values ($1, $2, $3, 2, 'distante') returning id`,
        [organizationId, source.id, document.id],
      );
      await session.query(
        `insert into public.knowledge_embeddings (chunk_id, organization_id, embedding, model)
         values ($1, $2, $3, 'gemini-embedding-test')`,
        [closeChunk[0].id, organizationId, fakeVector(5)],
      );
      await session.query(
        `insert into public.knowledge_embeddings (chunk_id, organization_id, embedding, model)
         values ($1, $2, $3, 'gemini-embedding-test')`,
        [farChunk[0].id, organizationId, fakeVector(500)],
      );

      const matches = await session.query<{ chunk_id: string; similarity: number }>(
        "select * from public.match_knowledge_chunks($1, $2, 1)",
        [organizationId, fakeVector(5)],
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].chunk_id).toBe(closeChunk[0].id);
    } finally {
      await session.close();
    }
  });

  it("chunk e embedding não podem pertencer a fonte/documento de organização diferente", async () => {
    const otherAdmin = await createAuthUser();
    const otherOrg = await bootstrapOrganization(otherAdmin, "Consultório C Conhecimento");

    const session = await openSession({ userId: admin });
    try {
      const [source] = await session.query<{ id: string }>(
        `insert into public.knowledge_sources
           (organization_id, title, storage_path, mime_type, byte_size, sha256)
         values ($1, 'Fonte A', $2, 'text/plain', 10, 'aaa111') returning id`,
        [organizationId, `${organizationId}/source-a/nota.txt`],
      );
      const [document] = await session.query<{ id: string }>(
        `insert into public.knowledge_documents (organization_id, source_id, extracted_text, char_count)
         values ($1, $2, 'x', 1) returning id`,
        [organizationId, source.id],
      );

      const error = await session.expectError(
        `insert into public.knowledge_chunks (organization_id, source_id, document_id, sequence, text)
         values ($1, $2, $3, 0, 'forjado')`,
        [otherOrg, source.id, document.id],
      );
      expect(error).toMatch(/same organization|must match/i);
    } finally {
      await session.close();
    }
  });

  it("ninguém tem GRANT genérico em storage.objects para o bucket knowledge-sources baseado só em membership", async () => {
    // A policy exige is_psychologist_admin(path[1]::uuid) — um membro sem
    // esse papel, ou tentando gravar sob o id de outra organização, é
    // recusado mesmo estando autenticado.
    const session = await openSession({ userId: secretary });
    try {
      const error = await session.expectError(
        `insert into storage.objects (bucket_id, name) values ('knowledge-sources', $1)`,
        [`${organizationId}/forged/file.txt`],
      );
      expect(error).toMatch(/permission denied|violates row-level security/i);
    } finally {
      await session.close();
    }
  });

  it("admin grava em storage.objects sob o próprio organization_id, mas não sob o de outra organização", async () => {
    const otherAdmin = await createAuthUser();
    const otherOrg = await bootstrapOrganization(otherAdmin, "Consultório D Conhecimento");

    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query(
        `insert into storage.objects (bucket_id, name) values ('knowledge-sources', $1) returning name`,
        [`${organizationId}/own-source/file.txt`],
      );
      expect(rows).toHaveLength(1);

      const error = await session.expectError(
        `insert into storage.objects (bucket_id, name) values ('knowledge-sources', $1)`,
        [`${otherOrg}/other-source/file.txt`],
      );
      expect(error).toMatch(/permission denied|violates row-level security/i);
    } finally {
      await session.close();
    }
  });
});
