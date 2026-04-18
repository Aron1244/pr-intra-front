const LOCAL_ACCESS_TOKEN_KEY = "intra_access_token";
const SESSION_ACCESS_TOKEN_KEY = "intra_session_access_token";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export function saveAccessToken(token: string, persist: boolean): void {
  if (!hasWindow()) {
    return;
  }

  if (persist) {
    window.localStorage.setItem(LOCAL_ACCESS_TOKEN_KEY, token);
    window.sessionStorage.removeItem(SESSION_ACCESS_TOKEN_KEY);
    return;
  }

  window.sessionStorage.setItem(SESSION_ACCESS_TOKEN_KEY, token);
  window.localStorage.removeItem(LOCAL_ACCESS_TOKEN_KEY);
}

export function getAccessToken(): string | null {
  if (!hasWindow()) {
    return null;
  }

  const persistentToken = window.localStorage.getItem(LOCAL_ACCESS_TOKEN_KEY);
  if (persistentToken) {
    return persistentToken;
  }

  return window.sessionStorage.getItem(SESSION_ACCESS_TOKEN_KEY);
}

export function clearAccessToken(): void {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.removeItem(LOCAL_ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(SESSION_ACCESS_TOKEN_KEY);
}