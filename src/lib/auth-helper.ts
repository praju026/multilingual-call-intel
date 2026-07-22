export async function getAuthenticatedUserId(): Promise<string> {
  if (!!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY) {
    try {
      const { auth } = await import('@clerk/nextjs/server');
      const session = await auth();
      if (session?.userId) {
        return session.userId;
      }
    } catch (err) {
      console.warn('[AuraIntel Auth] Could not retrieve Clerk session:', err);
    }
  }
  return 'guest';
}
