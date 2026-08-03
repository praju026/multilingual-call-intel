import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Check if Clerk keys are present
const hasClerkKeys = 
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && 
  !!process.env.CLERK_SECRET_KEY;

// Only import and initialize clerkMiddleware if keys exist
let clerkHandler: ((req: NextRequest, evt: any) => Promise<NextResponse> | NextResponse) | null = null;

if (hasClerkKeys) {
  try {
    const { clerkMiddleware, createRouteMatcher } = require('@clerk/nextjs/server');
    const isPublicRoute = createRouteMatcher([
      '/sign-in(.*)',
      '/sign-up(.*)',
      '/api/audio/(.*)', // Audio streaming needs public or token access
      '/api/webhooks/(.*)', // Webhooks must be public for external services
    ]);

    clerkHandler = clerkMiddleware(async (auth: any, req: NextRequest) => {
      if (!isPublicRoute(req)) {
        await auth.protect();
      }
    });
  } catch (err) {
    console.warn('[AuraIntel Auth] Failed to initialize Clerk middleware:', err);
  }
}

export async function middleware(req: NextRequest, evt: any) {
  if (clerkHandler) {
    return clerkHandler(req, evt);
  }
  // Fallback when Clerk is not configured: proceed freely
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
