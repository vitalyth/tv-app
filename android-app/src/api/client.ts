import {API_BASE_URL, API_TIMEOUT_MS} from '../config/api';

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {Accept: 'application/json'},
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(`API request failed (${response.status})`, response.status);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
