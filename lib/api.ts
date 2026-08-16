export const API_URL = (window as any)._env_?.API_URL || '/api';

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type ApiRequestInit = RequestInit & {
  json?: unknown;
};

type UploadRequestInit = {
  method?: string;
  body: XMLHttpRequestBodyInit;
  headers?: Record<string, string>;
  onProgress?: (loaded: number, total: number) => void;
};

export type UploadResponse = {
  ok: boolean;
  status: number;
  data: any;
};

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export async function apiFetch(
  input: RequestInfo | URL,
  { json, ...init }: ApiRequestInit = {}
) {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    body,
    credentials: 'include'
  });

  if (response.status === 401) {
    unauthorizedHandler?.();
  }
  return response;
}

export async function apiJson<T>(
  input: RequestInfo | URL,
  init?: ApiRequestInit
): Promise<T> {
  const response = await apiFetch(input, init);
  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    throw new ApiError(
      data?.error || `Request failed (${response.status})`,
      response.status,
      data
    );
  }
  return data as T;
}

export function apiUpload(
  input: string,
  {
    method = 'POST',
    body,
    headers = {},
    onProgress
  }: UploadRequestInit
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, input);
    request.withCredentials = true;
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    request.onerror = () => reject(new Error('网络连接中断'));
    request.onabort = () => reject(new Error('上传已取消'));
    request.onload = () => {
      if (request.status === 401) unauthorizedHandler?.();
      let data: any = {};
      if (request.responseText) {
        try {
          data = JSON.parse(request.responseText);
        } catch {
          data = { error: request.responseText };
        }
      }
      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        data
      });
    };
    request.send(body);
  });
}
