// public/main.js
// Minimal demo UI glue with robust loading overlay handling and ACH verification display.
let stripe;
let clientSecret;
let currentCustomer = null;

function $(sel) { return document.querySelector(sel); }

function setLoading(isLoading) {
  const overlay = $('#loading-overlay');
  if (!overlay) return;
  overlay.style.display = isLoading ? 'flex' : 'none';
  if (isLoading) {
    // auto dismiss fallback (15s)
    clearTimeout(setLoading._t);
    setLoading._t = setTimeout(() => {
      overlay.style.display = 'none';
    }, 15000);
  }
}

async function fetchJSON(url, opts = {}) {
  const ac = new AbortController();
  const id = Date.now();
  opts.signal = ac.signal;
  try {
    setLoading(true);
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    setLoading(false);
    ac.abort();
  }
}

async function refreshPaymentMethods(customerId) {
  const data = await fetchJSON(`/.netlify/functions/list-payment-methods?customerId=${encodeURIComponent(customerId)}`);
  const container = $('#payment-methods');
  container.innerHTML = '';
  for (const pm of data.payment_methods) {
    const div = document.createElement('div');
    div.className = 'pm-row';
    if (pm.type === 'us_bank_account' || pm.type === 'bank_account') {
      div.textContent = `${pm.bank_name || 'Bank'} •••• ${pm.last4 || ''} — ${pm.verified ? 'Verified' : (pm.status || 'Not verified')}`;
    } else if (pm.type === 'card') {
      div.textContent = `${pm.brand} •••• ${pm.last4} — exp ${pm.exp_month}/${pm.exp_year}`;
    } else {
      div.textContent = `${pm.type} ${pm.id}`;
    }
    div.dataset.pmId = pm.id;
    div.addEventListener('click', () => {
      document.querySelectorAll('.pm-row').forEach(n => n.classList.remove('selected'));
      div.classList.add('selected');
      $('#selected-pm-id').value = pm.id;
    });
    container.appendChild(div);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY);

  const customerSelect = $('#customer-select');
  const pmContainer = $('#payment-methods');
  const form = $('#charge-form');

  // Client selection handler with robust finally
  customerSelect.addEventListener('change', async () => {
    const id = customerSelect.value;
    if (!id) return;
    currentCustomer = id;
    try {
      await refreshPaymentMethods(id);
    } catch (e) {
      console.error(e);
      alert('Failed to load payment methods.');
    }
  });

  // Create setup intent (collect PM)
  $('#create-setup').addEventListener('click', async () => {
    if (!currentCustomer) return alert('Select a customer first.');
    try {
      const resp = await fetchJSON('/.netlify/functions/create-setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: currentCustomer })
      });
      clientSecret = resp.clientSecret;
      const elements = stripe.elements({ clientSecret, appearance: {} });
      const paymentElement = elements.create('payment');
      paymentElement.mount('#payment-element');
      $('#setup-section').style.display = 'block';
    } catch (e) {
      console.error(e);
      alert('Failed to create SetupIntent.');
    }
  });

  // Confirm setup (collect ACH/card)
  $('#confirm-setup').addEventListener('click', async () => {
    if (!clientSecret) return;
    setLoading(true);
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements: stripe.elements({ clientSecret }),
        clientSecret
      });
      if (error) throw error;
      alert('Payment method added.');
      await refreshPaymentMethods(currentCustomer);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  });

  // Charge now
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pmId = $('#selected-pm-id').value;
    const amount = $('#amount').value;
    const description = $('#description').value;
    const statementDescriptor = $('#statement-descriptor').value;
    if (!pmId) return alert('Pick a payment method.');
    try {
      const result = await fetchJSON('/.netlify/functions/outbound-client-charge-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: currentCustomer, paymentMethodId: pmId, amount, description, statementDescriptor
        }),
      });
      alert('Charged successfully: ' + result.paymentIntent.id);
    } catch (e) {
      console.error(e);
      alert('Charge failed: ' + e.message);
    }
  });
});
