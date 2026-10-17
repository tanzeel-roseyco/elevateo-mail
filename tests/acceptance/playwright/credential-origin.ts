// AIDEV-NOTE: Recheck each credential operation; private peers are reachable after redirects from app.test.
export async function atCredentialOrigin(currentURL: () => string | Promise<string>,
  operation: () => Promise<void>): Promise<void> {
  try {
    const url = new URL(await currentURL());
    if (url.origin !== 'http://app.test' || url.username || url.password) throw new Error();
  } catch { throw new Error('Credential destination rejected'); }
  await operation();
}

type SignInPage = { url(): string;
  getByLabel(label: string, options: { exact: true }): { fill(value: string): Promise<void> } };
export async function fillSignInCredentials(page: SignInPage, email: string, password: string): Promise<void> {
  await atCredentialOrigin(() => page.url(), () => page.getByLabel('Email address', { exact: true }).fill(email));
  await atCredentialOrigin(() => page.url(), () => page.getByLabel('Password', { exact: true }).fill(password));
}
