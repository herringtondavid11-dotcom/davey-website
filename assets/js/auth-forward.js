// A sign-in email link lands on the site's home page (Supabase's Site URL). Send it on to Davey on the web, which
// finishes the sign-in or shows the code screen, instead of leaving the visitor on the marketing page.
(function () {
  var l = window.location
  if (l.pathname !== '/' && l.pathname !== '/index.html') return
  var q = new URLSearchParams(l.search)
  var h = new URLSearchParams(l.hash.slice(1))
  if (q.has('code') || q.has('error_code') || h.has('access_token') || h.has('error_code')) {
    l.replace('/app/' + l.search + l.hash)
  }
})()
