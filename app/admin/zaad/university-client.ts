export class UniversityApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
  ) {
    super(code);
  }
}
export async function universityRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("tenant", "univ");
  const response = await fetch(
    `/api/admin/zaad/university/${route}?${params}`,
    {
      cache: "no-store",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    },
  );
  const data = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; fields?: Record<string, string> };
  } | null;
  if (!response.ok || !data || !("data" in data))
    throw new UniversityApiError(
      data?.error?.code ?? "SERVICE_UNAVAILABLE",
      response.status,
      data?.error?.fields,
    );
  return data.data as T;
}
export const universityMutation = <T>(
  path: string,
  value: unknown,
  method = "POST",
) => universityRequest<T>(path, { method, body: JSON.stringify(value) });
