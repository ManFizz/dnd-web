// Messages for the `?error=<code>` that sign-in and account linking redirects carry.

const OAUTH_ERRORS: Record<string, string> = {
  account_not_linked:
    "Эта почта уже зарегистрирована с паролем. Войдите по почте и паролю, а потом подключите Google или Discord на странице аккаунта.",
  unable_to_link_account: "Почта в этом сервисе не подтверждена. Подтвердите её там или войдите по почте и паролю.",
  email_not_verified: "Почта в этом сервисе не подтверждена. Подтвердите её там или войдите по почте и паролю.",
  email_not_found: "Сервис не передал почту. Разрешите доступ к почте или войдите по почте и паролю.",
  account_already_linked_to_different_user: "Этот аккаунт Google или Discord уже привязан к другому пользователю сайта.",
  access_denied: "Вход отменён.",
};

export function oauthErrorText(code: string | null | undefined): string | null {
  if (!code) return null;
  return OAUTH_ERRORS[code] ?? "Не удалось войти через внешний сервис. Попробуйте ещё раз.";
}

/** First value of a search param that may be repeated. */
export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
