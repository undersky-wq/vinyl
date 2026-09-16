import { NextRequest, NextResponse } from 'next/server';

const MAX_SELECTED_STYLES = 5;
const MAX_STYLE_VALUE_LENGTH = 240;

function rejectedFilterRequest(message: string) {
  return new NextResponse(message, {
    status: 429,
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': '3600',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export function middleware(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next();

  const rawStyles = request.nextUrl.searchParams.getAll('style');
  if (!rawStyles.length) return NextResponse.next();

  // The UI uses one sorted comma-separated value. Repeated style parameters
  // are legacy crawler URLs and previously caused a new SSR render per ordering.
  if (rawStyles.length > 1) return rejectedFilterRequest('Repeated style filters are not supported.');
  if (rawStyles[0].length > MAX_STYLE_VALUE_LENGTH) return rejectedFilterRequest('Style filter is too long.');

  const styles = [...new Set(rawStyles[0].split(',').map(value => value.trim()).filter(Boolean))];
  if (styles.length > MAX_SELECTED_STYLES) return rejectedFilterRequest('Choose up to 5 styles.');

  return NextResponse.next();
}

export const config = {
  matcher: '/',
};
