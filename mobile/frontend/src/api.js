export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4001';
async function request(path, token, init) {
    const response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body.error ?? 'Something went wrong. Please try again.');
        error.status = response.status;
        throw error;
    }
    return body;
}
export const api = {
    login: (phone_number, password) => request('/api/auth/login', undefined, { method: 'POST', body: JSON.stringify({ phone_number, password }) }),
    summary: (token) => request('/api/members/me/summary', token),
    member: (token) => request('/api/members/me', token),
    loans: (token) => request('/api/loans/me', token),
    loan: (token, id) => request(`/api/loans/${id}`, token),
    transactions: (token, offset = 0) => request(`/api/transactions/me?limit=30&offset=${offset}`, token),
    dividends: (token) => request('/api/dividends/me', token),
    notifications: (token, unread = false) => request(`/api/notifications/me${unread ? '?unread=true' : ''}`, token),
    markRead: (token, id) => request(`/api/notifications/${id}/read`, token, { method: 'PATCH' }),
    applyLoan: (token, payload) => request('/api/loans', token, { method: 'POST', body: JSON.stringify(payload) }),
    changePassword: (token, current_password, new_password) => request('/api/auth/password', token, { method: 'PATCH', body: JSON.stringify({ current_password, new_password }) }),
};
