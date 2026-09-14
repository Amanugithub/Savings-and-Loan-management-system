export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4001';

export async function request(path, token, init = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return body;
}
