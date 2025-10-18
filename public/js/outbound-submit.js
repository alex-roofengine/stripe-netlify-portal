<script>
document.addEventListener('DOMContentLoaded', () => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function currentWhen() {
    const active = $$('.pill[data-role="when"]').find(p => p.getAttribute('data-active') === 'true');
    return active ? active.getAttribute('data-val') : 'now';
    // expected values: 'now' | 'later'
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();    // capture even non-JSON errors
    let data = {};
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      console.error('Request failed', res.status, text);
      throw new Error(data.error || `${res.status} ${res.statusText}`);
    }
    return data;
  }

  const submitBtn = document.getElementById('submit');
  if (submitBtn) {
    // Ensure it is NOT a native form submit
    submitBtn.setAttribute('type', 'button');

    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault(); // extra safety

      const selectedCustomerId = window.selectedCustomer?.id || document.getElementById('customerId')?.value;
      const chosen = document.querySelector('input[name="pmPick"]:checked');
      const amount = document.getElementById('amount')?.value;
      const description = document.getElementById('desc')?.value || '';
      const statementDescriptor = document.getElementById('statementDescriptor')?.value || '';

      if (!selectedCustomerId) return alert('Select a client first.');
      if (!chosen) return alert('Pick a payment method first.');
      if (!amount || Number(amount) <= 0) return alert('Enter a valid amount.');

      const payload = {
        customerId: selectedCustomerId,
        paymentMethodId: chosen.value,
        amount,
        description,
        statementDescriptor
      };

      const when = currentWhen();
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
