<script>
/* Force-inject amount into Charge Later requests (even if another script builds the body) */
(function () {
  const $ = s => document.querySelector(s);
  const originalFetch = window.fetch;

  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : (input && input.url);
    const isChargeLater = url && url.indexOf('/.netlify/functions/outbound-client-charge-later') !== -1;

    if (isChargeLater) {
      // Normalize headers
      const headers = new Headers(init.headers || {});
      headers.set('Content-Type', 'application/json');

      // Parse existing body (if any)
      let bodyObj = {};
      if (init.body) { try { bodyObj = JSON.parse(init.body); } catch(_) {} }

      // Read amount from the number input and inject if missing
      const amtEl = $('#amount');
      const raw = (amtEl && amtEl.value || '').toString().trim();
      const normalized = raw.replace(/[$,\s]/g, '');
      if (!bodyObj.amount && normalized) {
        bodyObj.amount = normalized;          // e.g. "2500"
        console.log('[inject] amount ->', bodyObj.amount);
      }

      // (Optional) Add date/time/timezone if your UI has them
      const dateEl = document.getElementById('charge-date') || document.getElementById('date');
      if (!bodyObj.date && dateEl && dateEl.value) bodyObj.date = dateEl.value;
      if (!bodyObj.time) bodyObj.time = (document.getElementById('charge-time') || { value: '09:00' }).value || '09:00';
      if (!bodyObj.timezone) {
        try { bodyObj.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
        catch { bodyObj.timezone = 'UTC'; }
      }

      init.headers = headers;
      init.method = 'POST';
      init.body = JSON.stringify(bodyObj);
    }

    return originalFetch.call(this, input, init);
  };
})();
</script>
