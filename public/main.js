const stripe = Stripe(process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_...');

async function loadCustomers() {
  const res = await fetch('/.netlify/functions/customers');
  const data = await res.json();
  const sel = document.getElementById('customer-select');
  data.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.email;
    sel.append(opt);
  });
}
loadCustomers();

const sel = document.getElementById('customer-select');
const btn = document.getElementById('start-setup');
const form = document.getElementById('setup-form');
let clientSecret, currentCustomer;

sel.addEventListener('change', ()=> btn.disabled = !sel.value);
btn.addEventListener('click', async ()=>{
  currentCustomer = sel.value;
  const resp = await fetch('/.netlify/functions/create-setup-intent', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ customerId: currentCustomer })
  });
  clientSecret = (await resp.json()).clientSecret;
  const elements = stripe.elements();
  const card = elements.create('card');
  card.mount('#card-element');
  form.style.display='block';
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, { payment_method: { card } });
    if(error) return alert(error.message);
    await fetch('/.netlify/functions/attach-method', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({customerId:currentCustomer,paymentMethodId:setupIntent.payment_method})
    });
    alert('✅ Payment method updated!');
    form.reset(); form.style.display='none';
  });
});
