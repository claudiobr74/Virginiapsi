import { toWhatsAppAddress } from "@/lib/integrations/twilio/e164";

const TWILIO_API = "https://api.twilio.com/2010-04-01";

export class TwilioApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly retryable: boolean = status >= 500 || status === 429,
  ) {
    super(message);
    this.name = "TwilioApiError";
  }
}

export interface TwilioSendRequest {
  accountSid: string;
  authToken: string;
  to: string;
  body: string;
  from?: string;
  messagingServiceSid?: string;
  statusCallback?: string;
  idempotencyKey: string;
  contentSid?: string;
  contentVariables?: Record<string, string>;
}

export interface TwilioSendResult {
  sid: string;
  status: string;
}

export interface TwilioMessagingClientOptions {
  fetchImpl?: typeof fetch;
}

export class TwilioMessagingClient {
  private readonly fetchImpl: typeof fetch;

  constructor(options: TwilioMessagingClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(request: TwilioSendRequest): Promise<TwilioSendResult> {
    if (!request.from && !request.messagingServiceSid) {
      throw new TwilioApiError("missing_from_or_messaging_service", 400, "missing_from", false);
    }
    const body = new URLSearchParams();
    body.set("To", request.to);
    if (request.contentSid) {
      body.set("ContentSid", request.contentSid);
      if (request.contentVariables) {
        body.set("ContentVariables", JSON.stringify(request.contentVariables));
      }
    } else {
      body.set("Body", request.body);
    }
    if (request.messagingServiceSid) {
      body.set("MessagingServiceSid", request.messagingServiceSid);
    } else if (request.from) {
      body.set("From", toWhatsAppAddress(request.from.replace(/^whatsapp:/i, "")));
    }
    if (request.statusCallback) {
      body.set("StatusCallback", request.statusCallback);
    }

    const credentials = Buffer.from(`${request.accountSid}:${request.authToken}`).toString(
      "base64",
    );
    const response = await this.fetchImpl(
      `${TWILIO_API}/Accounts/${request.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": request.idempotencyKey,
        },
        body,
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      code?: number | string;
      message?: string;
    };

    if (!response.ok || !payload.sid) {
      throw new TwilioApiError(
        "twilio_send_failed",
        response.status,
        payload.code != null ? String(payload.code) : String(response.status),
        response.status >= 500 || response.status === 429,
      );
    }

    return { sid: payload.sid, status: payload.status ?? "queued" };
  }
}
