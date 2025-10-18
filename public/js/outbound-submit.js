<script>
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

  async function postJSON(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    let data = {}; try { data = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(data.error || (res.status + ' ' + res.statusText));
    return data;
  }

  const submitBtn = document.getElementById('submit');
  if (submitBtn) {
    submitBtn.setAttribute('type', 'button');
    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const selectedCustomerId = window.selectedCustomer?.id || $('#customerId')?.value;
      const chosen = document.querySelector('input[name="pmPick"]:checked');
      const amount = $('#amount')?.value; // dollars, e.g. "2500" for $2,500
      const description = $('#desc')?.value || '';
      const statementDescriptor = $('#statementDescriptor')?.value || '';
      const when = currentWhen();
      const date = $('#charge-date')?.value || $('#date')?.value || ''; // ensure your date input has id="charge-date"
      const time = $('#charge-time')?.value || '09:00'; // optional time input (HH:mm)
      const timezone = tzGuess();

      if (!selectedCustomerId) return alert('Select a client first.');
      if (!chosen) return alert('Pick a payment method first.');
      if (when === 'now' && (!amount || Number(amount) <= 0)) return alert('Enter a valid amount.');
      if (when === 'later' && !date) return alert('Pick a charge date.');

      const payload = {
        customerId: selectedCustomerId,
        paymentMethodId: chosen.value,
        amount, description, statementDescriptor,
        date, time, timezone
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
        console.error(err);
        alert(err.message || 'Request failed');
      }
    });
  }
});
</script>
