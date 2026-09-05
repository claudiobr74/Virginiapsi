import { describe, expect, it, vi } from "vitest";
import {
  GoogleMeetApiError,
  GoogleMeetClient,
} from "@/lib/integrations/google/meet-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GoogleMeetClient", () => {
  it("cria um Meet Space direto com transcrição automática e retorna os identificadores reais", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        name: "spaces/space-123",
        meetingUri: "https://meet.google.com/abc-defg-hij",
        meetingCode: "abc-defg-hij",
      }),
    );
    const client = new GoogleMeetClient({
      accessToken: "access-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const space = await client.createSpace({ autoTranscription: true });

    expect(space).toEqual({
      name: "spaces/space-123",
      meetingUri: "https://meet.google.com/abc-defg-hij",
      meetingCode: "abc-defg-hij",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://meet.googleapis.com/v2/spaces");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      config: {
        artifactConfig: {
          transcriptionConfig: {
            autoTranscriptionGeneration: "ON",
          },
        },
      },
    });
  });

  it("cria a sala sem configuração de transcrição quando solicitado", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        name: "spaces/space-456",
        meetingUri: "https://meet.google.com/xyz-uvwx-rst",
        meetingCode: "xyz-uvwx-rst",
      }),
    );
    const client = new GoogleMeetClient({
      accessToken: "access-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createSpace();

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("localiza conferenceRecords pelo space.name persistido da sessão", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        conferenceRecords: [
          {
            name: "conferenceRecords/conf-1",
            startTime: "2026-09-03T13:00:00Z",
            endTime: "2026-09-03T14:00:00Z",
            space: "spaces/space-123",
          },
        ],
      }),
    );
    const client = new GoogleMeetClient({
      accessToken: "access-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const records = await client.listConferenceRecordsForSpace("spaces/space-123");

    expect(records).toHaveLength(1);
    const [rawUrl] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(url.pathname).toBe("/v2/conferenceRecords");
    expect(url.searchParams.get("filter")).toBe('space.name = "spaces/space-123"');
    expect(url.searchParams.get("pageSize")).toBe("100");
  });

  it("lista transcrições e pagina todas as entradas estruturadas", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          transcripts: [
            {
              name: "conferenceRecords/conf-1/transcripts/transcript-1",
              state: "FILE_GENERATED",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transcriptEntries: [
            {
              name: "conferenceRecords/conf-1/transcripts/transcript-1/entries/entry-1",
              participant: "conferenceRecords/conf-1/participants/person-1",
              text: "Primeira fala",
              languageCode: "pt-BR",
              startTime: "2026-09-03T13:00:01Z",
              endTime: "2026-09-03T13:00:03Z",
            },
          ],
          nextPageToken: "next-entries",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transcriptEntries: [
            {
              name: "conferenceRecords/conf-1/transcripts/transcript-1/entries/entry-2",
              participant: "conferenceRecords/conf-1/participants/person-2",
              text: "Segunda fala",
              languageCode: "pt-BR",
              startTime: "2026-09-03T13:00:04Z",
              endTime: "2026-09-03T13:00:06Z",
            },
          ],
        }),
      );
    const client = new GoogleMeetClient({
      accessToken: "access-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const transcripts = await client.listTranscripts("conferenceRecords/conf-1");
    const entries = await client.listTranscriptEntries(transcripts[0]!.name);

    expect(transcripts[0]?.state).toBe("FILE_GENERATED");
    expect(entries.map((entry) => entry.text)).toEqual(["Primeira fala", "Segunda fala"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const thirdUrl = new URL((fetchImpl.mock.calls[2] as [string, RequestInit])[0]);
    expect(thirdUrl.searchParams.get("pageToken")).toBe("next-entries");
  });

  it("não aceita resposta incompleta como se fosse uma sala válida", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        name: "spaces/incomplete",
        meetingUri: "https://meet.google.com/incomplete",
      }),
    );
    const client = new GoogleMeetClient({
      accessToken: "access-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.createSpace()).rejects.toMatchObject({
      name: "GoogleMeetApiError",
      status: 502,
    });
  });

  it("preserva o status de erro retornado pela API do Google", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: "insufficient permission" } }, 403),
    );
    const client = new GoogleMeetClient({
      accessToken: "access-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const promise = client.createSpace();
    await expect(promise).rejects.toBeInstanceOf(GoogleMeetApiError);
    await expect(promise).rejects.toMatchObject({ status: 403 });
  });
});
