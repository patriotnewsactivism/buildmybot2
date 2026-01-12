export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

const LOGIN_HOST = 'login.buildmybot.app';

function getLoginRedirectUrl() {
  if (typeof window === 'undefined') {
    return '/?auth=login';
  }

  const hostname = window.location.hostname.toLowerCase();
  if (
    hostname.endsWith('.buildmybot.app') &&
    hostname !== LOGIN_HOST &&
    hostname !== 'buildmybot.app'
  ) {
    return `https://${LOGIN_HOST}/?auth=login`;
  }

  return '/?auth=login';
}

// Redirect to login with a toast notification
export function redirectToLogin(
  toast?: (options: {
    title: string;
    description: string;
    variant: string;
  }) => void,
) {
  if (toast) {
    toast({
      title: 'Unauthorized',
      description: 'You are logged out. Logging in again...',
      variant: 'destructive',
    });
  }
  setTimeout(() => {
    window.location.href = getLoginRedirectUrl();
  }, 500);
}
