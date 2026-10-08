const API_URL = import.meta.env.VITE_API_URL || '/api';

export async function api(path, options = {}) {
  const token = localStorage.getItem('messmeter-token');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) {
      localStorage.removeItem('messmeter-token');
      localStorage.removeItem('messmeter-user');
      window.dispatchEvent(new Event('messmeter:unauthorized'));
    }
    throw new Error(body.error || 'The request could not be completed.');
  }
  return body;
}
