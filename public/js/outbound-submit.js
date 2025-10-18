<script>
document.addEventListener('DOMContentLoaded', () => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // Robust amount reader: tries several common selectors; strips $, commas, spaces
  function getAmountValue() {
    const el =
      $('#amount') ||
      $('#usd-amount') ||
      document.querySelector('[data-role="amount"]') ||
      document.querySelector('input[name="amount"]') ||
      document.querySelector('input[placeholder*="Amount"]');

    if (!el) return null;
    const raw = (el.value ?? '').toString().trim();
    if (!raw) return null;
    const normalized = raw.replace(/[$,\s]/g, ''); // "2,500 " -> "2500"
    const num = Number(normalized);
    return Number.isFinite(num) ? String(num) : null; // keep as string for server JSON
  }

  function currentWhen() {
    const active = $$('.pill[data-role="when"]').find(p => p.getAttribute('data-active') === 'true');
    return active ? active.getAttribute('data-val') : 'now'; // 'now' | 'later'
  }

  function tzGuess() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  }

  async function postJSON(url, body) {
    console.log('[POST]', url, body); // <— VISIBILITY: confirm in DevTools that amount is present
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let data = {}; try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      console.error('Request failed', res.status, text);
      throw new Error(data.error || (res.status + ' ' + res.statusText));
    }
    return data;
  }

  const submitBtn = document.getElementById('submit');
  if (submitBtn) {
    submitBtn.setAttribute('type', 'button'); // prevent native form GET
    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const selectedCustomerId = window.selectedCustomer?.id || $('#customerId')?.value;
      const chosen = document.querySelector('input[name="pmPick"]:checked');
      const amount = getAmountValue();                           // ← now filled
      const description = $('#desc')?.value || '';
      const statementDescriptor = $('#statementDescriptor')?.value || '';
      const when = currentWhen();
      const date = $('#charge-date')?.value || $('#date')?.value || '';
      const time = $('#charge-time')?.value || '09:00';
      const timezone = tzGuess();

      if (!selectedCustomerId) return alert('Select a client first.');
      if (!chosen) return alert('Pick a payment method first.');
      if (when === 'now' && (!amount || Number(amount) <= 0)) return alert('Enter a valid amount.');
      if (when === 'later' && !date && !amount) {
        // You can allow “date only” if your backend derives amount from product/price
        return alert('Enter a valid amount or choose a priced product.');
      }

      const payload = {
        customerId: selectedCustomerId,
        paymentMethodId: chosen.value,
        amount,                         // ← INCLUDED
        description,
        statementDescriptor,
        date, time, timezone
        // If you also send product/price, include them:
        // productId: $('#productId')?.value || undefined,
        // priceId:   $('#priceId')?.value || undefined,
      };

      try {
        if (when === 'later') {
          const r = await postJSON('/.netlify/functions/outbound-client-charge-later', payload);
          alert('Saved for later. PaymentIntent: ' + r.paymentIntent.id);
        } else {
          const r = await postJSON('/.netlify/functions/outbound-client-charge-now', payload);
          alert('Charged successfully: ' + r.paymentIntent.id);
        }
      } catch (err) {
        alert(err.message || 'Request failed');
      }
    });
  }
});
</script>
