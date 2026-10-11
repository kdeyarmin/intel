// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

afterEach(cleanup);

const { auth, adoptSession } = vi.hoisted(() => ({
  auth: { tokenInfo: vi.fn(), resetPassword: vi.fn(), forgotPassword: vi.fn() },
  adoptSession: vi.fn(),
}));
vi.mock('@/api/base44Client', () => ({ base44: { auth } }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ adoptSession }) }));

import ResetPassword from '../src/components/auth/ResetPassword';
import ForgotPassword from '../src/components/auth/ForgotPassword';

function at(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reset-password" element={element} />
        <Route path="/forgot-password" element={element} />
        <Route path="/" element={<div>home</div>} />
        <Route path="/pending" element={<div>pending screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const TOKEN = 'a'.repeat(43);

describe('ResetPassword', () => {
  beforeEach(() => {
    for (const fn of Object.values(auth)) fn.mockReset();
    adoptSession.mockReset();
  });

  it('explains a dead link instead of showing a form', async () => {
    auth.tokenInfo.mockResolvedValue({ valid: false });
    at(`/reset-password?token=${TOKEN}`, <ResetPassword />);
    expect(await screen.findByText("This link doesn't work")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Request a new reset link/ })).toHaveAttribute('href', '/forgot-password');
  });

  it("offers a retry when the link can't be checked, instead of calling it invalid", async () => {
    auth.tokenInfo.mockRejectedValueOnce(Object.assign(new Error('Service unavailable'), { status: 503 }));
    auth.tokenInfo.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    auth.tokenInfo.mockResolvedValueOnce({ valid: true, purpose: 'reset', email: 'rep@example.com' });
    at(`/reset-password?token=${TOKEN}`, <ResetPassword />);
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't check this link");
    expect(screen.queryByText("This link doesn't work")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't check this link");
    expect(auth.tokenInfo).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Choose a new password')).toBeInTheDocument();
    expect(auth.tokenInfo).toHaveBeenCalledTimes(3);
  });

  it('finishes an invite: asks for a name, checks the passwords match, and signs in', async () => {
    auth.tokenInfo.mockResolvedValue({ valid: true, purpose: 'invite', email: 'ivy@example.com', full_name: null });
    auth.resetPassword.mockResolvedValue({ id: 5, email: 'ivy@example.com', status: 'active' });
    at(`/reset-password?token=${TOKEN}`, <ResetPassword />);
    expect(await screen.findByText('Set up your account')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ivy' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'ivy-password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'ivy-passwrd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("don't match");
    expect(auth.resetPassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'ivy-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('home')).toBeInTheDocument();
    expect(auth.resetPassword).toHaveBeenCalledWith(TOKEN, 'ivy-password', 'Ivy');
    expect(adoptSession).toHaveBeenCalledWith({ id: 5, email: 'ivy@example.com', status: 'active' });
  });

  it('waits for the full session before leaving, so the first page sees the organization and owner role', async () => {
    auth.tokenInfo.mockResolvedValue({ valid: true, purpose: 'invite', email: 'ola@example.com', full_name: 'Ola' });
    auth.resetPassword.mockResolvedValue({ id: 6, email: 'ola@example.com', status: 'active' });
    let finish;
    adoptSession.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    at(`/reset-password?token=${TOKEN}`, <ResetPassword />);
    await screen.findByText('Set up your account');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'ola-password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'ola-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(adoptSession).toHaveBeenCalled());
    // The session is still loading: the app must not open yet.
    expect(screen.queryByText('home')).not.toBeInTheDocument();
    finish({ id: 6, email: 'ola@example.com', status: 'active', orgId: 3, orgRole: 'owner' });
    expect(await screen.findByText('home')).toBeInTheDocument();
  });

  it('sends someone still awaiting approval to the waiting screen after a reset', async () => {
    auth.tokenInfo.mockResolvedValue({ valid: true, purpose: 'reset', email: 'new@example.com' });
    auth.resetPassword.mockResolvedValue({ id: 2, email: 'new@example.com', status: 'pending' });
    at(`/reset-password?token=${TOKEN}`, <ResetPassword />);
    await screen.findByText('Choose a new password');
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByText('pending screen')).toBeInTheDocument();
  });
});

describe('ForgotPassword', () => {
  it("says to ask an admin when email reset isn't set up", async () => {
    auth.forgotPassword.mockResolvedValue({ success: true, emailReset: false, message: 'Password reset by email isn’t set up. Ask an administrator for a reset link.' });
    at('/forgot-password', <ForgotPassword />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rep@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(auth.forgotPassword).toHaveBeenCalledWith('rep@example.com'));
    expect(await screen.findByText(/Ask an administrator/)).toBeInTheDocument();
  });
});
