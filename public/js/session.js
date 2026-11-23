// Client-side authentication session management.
// Persists token and user profile in localStorage and provides auth header helpers.

const SESSION_KEY = 'eventpass_auth_session';

/**
 * Retrieves the stored session.
 * @returns {{ token: string, user: { id: string, name: string, email: string, role: string } } | null}
 */
export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getToken() {
  const session = getSession();
  return session ? session.token : null;
}

export function getUser() {
  const session = getSession();
  return session ? session.user : null;
}

/**
 * Stores the authenticated user session.
 */
export function setSession({ token, user }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
  window.dispatchEvent(new CustomEvent('session-changed', { detail: { token, user } }));
}

/**
 * Logs the user out and clears session storage.
 */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent('session-changed', { detail: null }));
}

/**
 * Returns authorization headers with Bearer token if logged in.
 */
export function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Redirects visitors to login if unauthenticated or missing required role.
 */
export function requireAuth(allowedRole = null) {
  const session = getSession();
  if (!session || !session.token) {
    const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?redirect=${currentPath}`;
    return null;
  }

  if (allowedRole && session.user.role !== allowedRole) {
    alert(`Access restricted to ${allowedRole} accounts.`);
    window.location.href = '/';
    return null;
  }

  return session.user;
}
