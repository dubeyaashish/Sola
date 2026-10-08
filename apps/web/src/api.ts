const KEY = 'sola.token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') { setToken(null); location.reload(); }
    throw new ApiError(res.status, data.error ?? 'ERROR', data.message ?? res.statusText);
  }
  return data as T;
}
export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const put = <T = any>(p: string, b?: unknown) => api<T>('PUT', p, b ?? {});
export const del = <T = any>(p: string) => api<T>('DELETE', p);
export const patch = <T = any>(p: string, b?: unknown) => api<T>('PATCH', p, b ?? {});

/** Fetches an authenticated text resource (used for printable HTML). */
export async function getText(path: string): Promise<string> {
  const res = await fetch(`/api${path}`, { headers: getToken() ? { authorization: `Bearer ${getToken()}` } : {} });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new ApiError(res.status, d.error ?? 'ERROR', d.message ?? res.statusText); }
  return res.text();
}
