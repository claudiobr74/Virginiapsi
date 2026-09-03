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

    await expect(client.createSpace()).rejects.toBeInstanceOf(GoogleMeetApiError);
    await expect(client.createSpace()).rejects.toMatchObject({ status: 403 });
  });
});
