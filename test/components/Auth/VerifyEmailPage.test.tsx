import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyEmailPage } from '../../../components/Auth/VerifyEmailPage';
import { resetAuthActionClientForTests } from '../../../components/Auth/authActionClient';

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/verify-email${search}`]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
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

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    resetAuthActionClientForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows an invalid state when the link has no token', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    expect(screen.getByRole('alert').textContent).toMatch(/missing a token/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a loading state, then posts the token and shows success', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderPage('?token=good-token');
    expect(screen.getByRole('status').textContent).toMatch(/verifying/i);

    resolveFetch(
      jsonResponse(200, { success: true, message: 'Email verified' }),
    );
    expect(await screen.findByText('Email verified')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
      'href',
      '/?auth=login',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/verify-email$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ token: 'good-token' });
  });

  it('shows the invalid state for an expired token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(400, {
          error: 'This verification link is invalid, expired or already used',
          code: 'invalid_token',
        }),
      ),
    );

    renderPage('?token=expired');
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('shows an error state and retries after a server failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: 'Mail store down' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, message: 'Email verified' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderPage('?token=retry-me');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mail store down',
    );

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Email verified')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows an error when the request cannot reach the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    renderPage('?token=offline');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/unable to reach/i);
    });
  });
});
