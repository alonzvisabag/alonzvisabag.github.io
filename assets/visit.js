// Tells Alon on Telegram when someone opens the site: once per visit, and never for Alon himself.
// Open any page with ?me once on each of your own browsers to stop alerts from them (?notme undoes it).
(function () {
    const ENDPOINT = 'https://roni-contribute.alonzvisabag.workers.dev/visit';
    const params = new URLSearchParams(location.search);
    try {
        if (params.has('me')) localStorage.setItem('visit-me', '1');
        if (params.has('notme')) localStorage.removeItem('visit-me');
        if (localStorage.getItem('visit-me')) return;
        if (sessionStorage.getItem('visit-sent')) return;
        sessionStorage.setItem('visit-sent', '1');
    } catch (e) {
        return;
    }
    const body = JSON.stringify({ page: location.pathname, ref: document.referrer || '', from: params.get('from') || '' });
    try {
        if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    fetch(ENDPOINT, { method: 'POST', body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
})();
