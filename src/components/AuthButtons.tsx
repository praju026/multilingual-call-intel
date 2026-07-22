'use client';

import React from 'react';
import { useAuth, UserButton, SignInButton } from '@clerk/nextjs';
import { User } from 'lucide-react';

export default function AuthButtons() {
  const hasClerkKey = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!hasClerkKey) {
    return (
      <div className="badge badge-warning" style={{ gap: '0.4rem', padding: '0.5rem 0.75rem' }}>
        <User size={14} /> Local Offline Mode
      </div>
    );
  }

  return <ActiveClerkAuthButtons />;
}

function ActiveClerkAuthButtons() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      {!isSignedIn && (
        <SignInButton mode="modal">
          <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
            Sign In / Register
          </button>
        </SignInButton>
      )}
      {isSignedIn && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>My Account:</span>
          <UserButton />
        </div>
      )}
    </div>
  );
}
