import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordPage } from '../../../components/Auth/ResetPasswordPage';

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an invalid state when the link has no token', () => {
    renderPage();
    expect(screen.getByRole('alert').textContent).toMatch(/missing a token/i);
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it('rejects a short password and a mismatched confirmation', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage('?token=reset-token');

    await userEvent.type(screen.getByLabelText(/new password/i), 'short');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'short');
    await userEvent.click(
      screen.getByRole('button', { name: /update password/i }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 8/i);
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(/new password/i));
    await userEvent.clear(screen.getByLabelText(/confirm password/i));
    await userEvent.type(screen.getByLabelText(/new password/i), 'longenough');
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      'different1',
    );
    await userEvent.click(
      screen.getByRole('button', { name: /update password/i }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the token and new password, then shows success', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, message: 'Password updated' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPage('?token=reset-token');

    await userEvent.type(screen.getByLabelText(/new password/i), 'longenough');
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      'longenough',
    );
    await userEvent.click(
      screen.getByRole('button', { name: /update password/i }),
    );

    expect(await screen.findByText('Password updated')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
      'href',
      '/?auth=login',
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/reset-password$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      token: 'reset-token',
      password: 'longenough',
    });
  });

  it('replaces the form when the token is expired', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(400, {
          error: 'This reset link is invalid, expired or already used',
          code: 'invalid_token',
        }),
      ),
    );
    renderPage('?token=used-token');

    await userEvent.type(screen.getByLabelText(/new password/i), 'longenough');
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      'longenough',
    );
    await userEvent.click(
      screen.getByRole('button', { name: /update password/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it('keeps the form when the server returns a non-token error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(500, { error: 'Could not save password' }),
      ),
    );
    renderPage('?token=reset-token');

    await userEvent.type(screen.getByLabelText(/new password/i), 'longenough');
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      'longenough',
    );
    await userEvent.click(
      screen.getByRole('button', { name: /update password/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save password',
    );
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
  });
});
