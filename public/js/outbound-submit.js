// public/js/outbound-submit.js
document.addEventListener('DOMContentLoaded', () => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function currentWhen() {
    const active = $$('.pill[data-role="when"]').find(p => p.getAttribute('data-active') === 'true');
    return active ? active.getAttribute('data-val') : 'now'; // 'now' | 'later'
  }

  function tzGuess() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  }

  function getAmountValue() {
    const el = $('#amount');
    if (!el) return null;
    const raw = (el.value ?? '').toString().trim();
    if (!raw) return null;
    const normalized = raw.replace(/[$,\s]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) && num > 0 ? String(num) : null;
  }

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

  // Click handler
  const submitBtn = $('#submit');
  if (submitBtn) {
    submitBtn.type = 'button'; // prevent native form submit
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
      if (!amount) return alert('Please enter a valid amount.');

      const payload = {
        customerId: selectedCustomerId,
        paymentMethodId: chosen.value,
        amount, description, statementDescriptor,
        date: when === 'later' ? date : undefined,
        time: when === 'later' ? time : undefined,
        timezone: when === 'later' ? timezone : undefined
        // If you also have product/price pickers, you can include:
        // productId: $('#productId')?.value || undefined,
        // priceId:   $('#priceId')?.value   || undefined,
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
        alert('❌ ' + (err.message || 'Request failed'));
      }
    });
  }
});
