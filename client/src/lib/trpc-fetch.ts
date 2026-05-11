import { apiUrl } from './api-base';

export async function trpcQuery<T>(path: string, input?: unknown): Promise<T> {
  const suffix = input === undefined
    ? ''
    : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await fetch(apiUrl(`/api/trpc/${path}${suffix}`));
  const data = await res.json();
  const payload = data?.result?.data?.json;

  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `Request failed (${res.status})`);
  }

  return payload as T;
}

export async function trpcMutate<T>(path: string, input?: unknown): Promise<T> {
  const res = await fetch(apiUrl(`/api/trpc/${path}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: input }),
  });
  const data = await res.json();
  const payload = data?.result?.data?.json;

  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `Request failed (${res.status})`);
  }

  return payload as T;
}
