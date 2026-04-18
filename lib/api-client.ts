import { getAccessToken } from "@/lib/auth-token";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

type PrimitiveBody = string | number | boolean | null;
type JsonValue = PrimitiveBody | JsonValue[] | { [key: string]: JsonValue };

export type ApiFetchOptions = Omit<RequestInit, "body"> & {
  auth?: boolean;
  token?: string;
  body?: JsonValue | FormData;
};

export class ApiClientError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.payload = payload;
  }
}

function buildUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

function getErrorMessage(payload: unknown, status: number): string {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  if (payload && typeof payload === "object" && "errors" in payload) {
    const errors = (payload as { errors?: Record<string, string[] | string> }).errors;

    if (errors && typeof errors === "object") {
      for (const fieldErrors of Object.values(errors)) {
        if (Array.isArray(fieldErrors) && typeof fieldErrors[0] === "string") {
          return fieldErrors[0];
        }

        if (typeof fieldErrors === "string") {
          return fieldErrors;
        }
      }
    }
  }

  return `Request failed with status ${status}`;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, token, body, headers: inputHeaders, ...rest } = options;
  const headers = new Headers(inputHeaders);

  headers.set("Accept", "application/json");

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const bearerToken = token ?? getAccessToken();
    if (!bearerToken) {
      throw new ApiClientError("Missing access token.", 401, null);
    }
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...rest,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(
      "No se pudo conectar con el backend. Revisa URL de API, CORS y que el servidor este encendido.",
      0,
      null,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiClientError(getErrorMessage(payload, response.status), response.status, payload);
  }

  return payload as T;
}