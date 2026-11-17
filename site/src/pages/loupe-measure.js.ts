import { bookmarklet } from '../lib/bookmarklet'

// The bookmarklet's code as a file: the "measure this page" button on /tools loads it, because the CSP forbids javascript: URLs.
export const GET = () =>
  new Response(bookmarklet().code, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } })
