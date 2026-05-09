const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function buildOAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state: userId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<{ accessToken: string; refreshToken: string; expiry: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? 'Token exchange failed');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiry: Date.now() + data.expires_in * 1000,
  };
}

export async function getValidAccessToken(token: {
  accessToken: string;
  refreshToken: string;
  expiry: number;
}): Promise<{ accessToken: string; refreshed: boolean; newExpiry?: number }> {
  if (token.expiry - Date.now() > 60_000) {
    return { accessToken: token.accessToken, refreshed: false };
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: token.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? 'Token refresh failed');
  const newExpiry = Date.now() + data.expires_in * 1000;
  return { accessToken: data.access_token, refreshed: true, newExpiry };
}

export async function listMessageIds(
  accessToken: string,
  afterTimestampMs: number,
): Promise<string[]> {
  const after = Math.floor(afterTimestampMs / 1000);
  const q = encodeURIComponent(
    `after:${after} (subject:transacción OR subject:pago OR subject:débito OR subject:crédito OR subject:compra OR subject:transferencia OR subject:cargo OR subject:abono OR subject:notificación)`,
  );
  const res = await fetch(`${GMAIL_API}/messages?q=${q}&maxResults=20`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Gmail list failed');
  const data = await res.json();
  return (data.messages ?? []).map((m: { id: string }) => m.id);
}

function decodeBase64Url(b64: string): string {
  try {
    return Buffer.from(b64, 'base64url').toString('utf-8');
  } catch {
    return '';
  }
}

function extractText(part: Record<string, unknown>): string {
  const mimeType = part.mimeType as string;
  const body = part.body as Record<string, unknown> | undefined;
  const parts = part.parts as Record<string, unknown>[] | undefined;

  if (mimeType === 'text/plain' && body?.data) {
    return decodeBase64Url(body.data as string);
  }
  if (parts) {
    return parts.map(p => extractText(p)).join('\n');
  }
  return '';
}

export async function fetchEmailContent(
  accessToken: string,
  messageId: string,
): Promise<{ subject: string; snippet: string; body: string; date: string }> {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail fetch failed for ${messageId}`);
  const data = await res.json();

  const headers: { name: string; value: string }[] = data.payload?.headers ?? [];
  const subject = headers.find(h => h.name === 'Subject')?.value ?? '';
  const rawDate = headers.find(h => h.name === 'Date')?.value ?? '';
  const snippet = data.snippet ?? '';

  let date = '';
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      date = parsed.toISOString().split('T')[0];
    }
  }
  if (!date) {
    date = new Date().toISOString().split('T')[0];
  }

  const body = extractText(data.payload ?? {}).slice(0, 3000);

  return { subject, snippet, body, date };
}
