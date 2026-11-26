// Calls the API through the same-origin /api proxy (ADR 0001), in the result shape useSubmit expects.
export async function api<T = unknown>(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(json?.message) ? json.message.join('; ') : json?.message;
    return { data: null, error: { status: res.status, message: typeof message === 'string' ? message : undefined } };
  }
  return { data: json as T, error: null };
}
