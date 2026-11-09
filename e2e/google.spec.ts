import { test, expect } from '@playwright/test';

for (const enabled of [true, false]) {
 test(`Google sign-in follows enabled provider settings (${enabled})`, async ({ page }) => {
  await page.route('**/api/connection', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/.netlify/identity/settings', route => route.fulfill({ json: { external: { google: enabled, email: true }, disable_signup: false, autoconfirm: false } }));
  await page.route('**/.netlify/identity/authorize?provider=google', route => route.fulfill({ contentType: 'text/html', body: '<p>OAuth redirect intercepted by test</p>' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to your account', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Email address')).toBeVisible();
  const google = dialog.getByRole('button', { name: 'Continue with Google', exact: true });
  if (enabled) {
   await expect(google).toBeVisible();
   await dialog.getByRole('button', { name: 'Create an account', exact: true }).click();
   await expect(dialog.getByLabel('Your name')).toBeVisible();
   await expect(google).toBeVisible();
   // Empty email/password fields must not block provider navigation.
   await google.click();
   await expect(page).toHaveURL(/\/\.netlify\/identity\/authorize\?provider=google$/);
  } else {
   await expect(dialog.getByRole('status')).toHaveText('Google sign-in is not available yet.');
   await expect(google).toHaveCount(0);
  }
 });
}

test('Google settings outage keeps email sign-in available', async ({ page }) => {
 await page.route('**/api/connection', route => route.fulfill({ json: { configured: false } }));
 await page.route('**/.netlify/identity/settings', route => route.fulfill({ status: 503, json: { error: 'synthetic outage' } }));
 await page.goto('/');
 await page.getByRole('button', { name: 'Sign in to your account', exact: true }).click();
 const dialog = page.getByRole('dialog');
 await expect(dialog.getByRole('status')).toHaveText('Google sign-in is temporarily unavailable. Please try again later.');
 await expect(dialog.getByLabel('Email address')).toBeEditable();
 await expect(dialog.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
 await expect(dialog.getByRole('button', { name: 'Continue with Google', exact: true })).toHaveCount(0);
});
