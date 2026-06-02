import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/email/callback`,
  );
}

export function getGmailAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function getUserEmail(accessToken: string): Promise<string> {
  const client = getOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return data.email ?? '';
}

interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
}

export async function fetchBankEmails(
  accessToken: string,
  refreshToken: string | null,
): Promise<EmailMessage[]> {
  const client = getOAuthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken ?? undefined,
  });

  const gmail = google.gmail({ version: 'v1', auth: client });

  // Search bank/transaction notification emails from last 30 days
  const query = [
    'newer_than:30d',
    '(',
    'subject:transacción OR subject:transaccion',
    'OR subject:cargo',
    'OR subject:compra',
    'OR subject:pago',
    'OR subject:transferencia',
    'OR subject:retiro',
    'OR subject:deposito OR subject:depósito',
    'OR subject:débito OR subject:debito',
    'OR subject:crédito OR subject:credito',
    'OR subject:"notificación de" OR subject:"notificacion de"',
    ')',
  ].join(' ');

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 30,
  });

  const messages = listRes.data.messages ?? [];
  const emails: EmailMessage[] = [];

  for (const msg of messages.slice(0, 20)) {
    try {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });

      const headers = full.data.payload?.headers ?? [];
      const subject = headers.find(h => h.name === 'Subject')?.value ?? '';
      const from = headers.find(h => h.name === 'From')?.value ?? '';
      const date = headers.find(h => h.name === 'Date')?.value ?? '';

      const body = extractBody(full.data.payload as Record<string, unknown> | undefined);

      if (body.trim().length > 0) {
        emails.push({ id: msg.id!, subject, from, date, body: body.slice(0, 3000) });
      }
    } catch {
      // skip emails that fail to parse
    }
  }

  return emails;
}

function extractBody(payload: Record<string, unknown> | undefined | null): string {
  if (!payload) return '';

  const parts = payload.parts as Record<string, unknown>[] | undefined;
  if (parts) {
    for (const part of parts) {
      if (part.mimeType === 'text/plain') {
        const data = (part.body as Record<string, unknown>)?.data as string;
        if (data) return Buffer.from(data, 'base64').toString('utf-8');
      }
    }
    for (const part of parts) {
      const text = extractBody(part as Record<string, unknown>);
      if (text) return text;
    }
  }

  const body = payload.body as Record<string, unknown> | undefined;
  if (body?.data) {
    return Buffer.from(body.data as string, 'base64').toString('utf-8');
  }

  return '';
}
