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
    // the link in Alon's CV ends with #about, so those visits are tagged as coming from the CV
    const tag = params.get('from') || (location.hash === '#about' ? 'הקורות-חיים' : '');
    const body = JSON.stringify({ page: location.pathname, ref: document.referrer || '', from: tag });
    // A plain request goes out right away; a beacon can be held back by the browser (iPhones often
    // wait until the page is closed), so it's only the fallback.
    const beacon = () => { try { navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' })); } catch (e) {} };
    if (window.fetch) {
        fetch(ENDPOINT, { method: 'POST', body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } }).catch(beacon);
    } else {
        beacon();
    }
})();
