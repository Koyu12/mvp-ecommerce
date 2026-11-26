// Calls the API through the same-origin /api proxy (ADR 0001), in the result shape useSubmit expects.
// On failure, `body` is the parsed error response, for routes that answer with more than a message.
export async function api<T = unknown>(path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(body === undefined ? undefined : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(json?.message) ? json.message.join('; ') : json?.message;
    return { data: null, error: { status: res.status, message: typeof message === 'string' ? message : undefined, body: json as unknown } };
  }
  return { data: json as T, error: null };
}
