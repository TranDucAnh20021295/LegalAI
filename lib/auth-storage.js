const LEGACY_TOKEN_KEY = 'token';

export const USER_TOKEN_KEY = 'legalai_user_token';
export const ADMIN_TOKEN_KEY = 'legalai_admin_token';

export function getUserToken() {
  if (typeof window === 'undefined') return null;
  let t = localStorage.getItem(USER_TOKEN_KEY);
  if (!t) {
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacy) {
      localStorage.setItem(USER_TOKEN_KEY, legacy);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      t = legacy;
    }
  }
  return t;
}

export function setUserToken(token) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_TOKEN_KEY, token);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function clearUserToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function getAdminToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}
