"use client";

// Small fetch helpers for the campaign screens: JSON in, JSON out, server errors as Error.

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string };
    return new ApiError(body.error ?? `Ошибка ${res.status}`, res.status);
  } catch {
    return new ApiError(`Ошибка ${res.status}`, res.status);
  }
}

export async function api<T = void>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    cache: "no-store",
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw await apiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
