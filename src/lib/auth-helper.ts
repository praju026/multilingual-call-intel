export async function getAuthSession(): Promise<{ userId: string; orgId: string | null }> {
  if (!!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY) {
    try {
      const { auth } = await import('@clerk/nextjs/server');
      const session = await auth();
      if (session?.userId) {
        return { userId: session.userId, orgId: session.orgId || null };
      }
    } catch (err) {
      console.warn('[AuraIntel Auth] Could not retrieve Clerk session:', err);
    }
  }
  return { userId: 'guest', orgId: null };
}
