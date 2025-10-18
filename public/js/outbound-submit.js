<script>
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function currentWhen() {
    const active = $$('.pill[data-role="when"]').find(p => p.getAttribute('data-active') === 'true');
    return active ? active.getAttribute('data-val') : 'now';
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
    return data;
  }

  async function chargeLater(payload) {
    return postJSON('/.netlify/functions/outbound-client-charge-later', payload);
  }

  async function chargeNow(payload) {
    return postJSON('/.netlify/functions/outbound-client-charge-now', payload);
  }

  const submitBtn = document.getElementById('submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault(); // critical: avoid GET submits
      try {
        const selectedCustomerId = window.selectedCustomer?.id || $('#customerId')?.value;
        const chosen = document.querySelector('input[name="pmPick"]:checked');
        const amount = $('#amount')?.value;
        const description = $('#desc')?.value || '';
        const statementDescriptor = $('#statementDescriptor')?.value || '';

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
        if (when === 'later') {
          const r = await chargeLater(payload);
          alert('Saved for later. PaymentIntent: ' + r.paymentIntent.id);
        } else {
          const r = await chargeNow(payload);
          alert('Charged successfully: ' + r.paymentIntent.id);
        }
      } catch (err) {
        console.error('Submit error:', err);
        alert(err.message || 'Request failed');
      }
    });
  }
</script>
