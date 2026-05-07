import { clerkMiddleware } from '@clerk/nextjs/server';

// Minimal proxy: just attaches Clerk auth headers to every request.
// Route protection is handled in app/(app)/layout.tsx via auth().
export default clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
