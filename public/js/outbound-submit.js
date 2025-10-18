document.addEventListener('DOMContentLoaded', () => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // Finds your selected "Charge Now / Charge Later"
  function currentWhen() {
    const active = $$('.pill[data-role="when"]').find(p => p.getAttribute('data-active') === 'true');
    return active ? active.getAttribute('data-val') : 'now';
  }

  // Reads the timezone automatically
  function tzGuess() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  }

  // Reads and sanitizes the amount (supports number or text field)
  function getAmountValue() {
    const el = $('#amount');
    if (!el) return null;
    const raw = (el.value ?? '').toString().trim();
    if (!raw) return null;
    const normalized = raw.replace(/[$,\s]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) && num > 0 ? String(num) : null;
  }

  // Generic JSON POST helper with visible logging
  async function postJSON(url, body) {
    console.log('[POST]', url, body);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      console.error('Request failed', res.status, text);
      throw new Error(data.error || (res.status + ' ' + res.statusText));
    }
    return data;
  }

  // Hook up the submit button
  const submitBtn = $('#submit');
  if (submitBtn) {
    submitBtn.type = 'button'; // prevent native form submission
    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const selectedCustomerId = window.selectedCustomer?.id || $('#customerId')?.value;
      const chosen = document.querySelector('input[name="pmPick"]:checked');
      const amount = getAmountValue();
      const description = $('#desc')?.value || '';
      const statementDescriptor = $('#statementDescriptor')?.value || '';
      const when = currentWhen();
      const date = $('#charge-date')?.value || $('#date')?.value || '';
      const time = $('#charge-time')?.value || '09:00';
      const timezone = tzGuess();

      if (!selectedCustomerId) return alert('Please select a client first.');
      if (!chosen) return alert('Please select a payment method.');
      if (!amount || Number(amount) <= 0) return alert('Please enter a valid amount.');

      // build payload
      const payload = {
        customerId: selectedCustomerId,
        paymentMethodId: chosen.value,
        amount, description, statementDescriptor,
        date, time, timezone
      };

      try {
        if (when === 'later') {
          const r = await postJSON('/.netlify/functions/outbound-client-charge-later', payload);
          alert('✅ Saved for later. PaymentIntent: ' + r.paymentIntent.id);
        } else {
          const r = await postJSON('/.netlify/functions/outbound-client-charge-now', payload);
          alert('✅ Charged successfully: ' + r.paymentIntent.id);
        }
      } catch (err) {
        console.error(err);
        alert('❌ ' + (err.message || 'Request failed'));
      }
    });
  }
});
