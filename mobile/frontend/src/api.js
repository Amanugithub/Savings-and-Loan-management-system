export { API_URL, request } from './api-request.mjs';
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
    guarantorResponse: (token, id, decision) => request(`/api/loans/${id}/guarantor-response`, token, { method: 'PATCH', body: JSON.stringify({ decision }) }),
    changePassword: (token, current_password, new_password) => request('/api/auth/password', token, { method: 'PATCH', body: JSON.stringify({ current_password, new_password }) }),
};
