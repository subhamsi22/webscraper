const accessForm = document.getElementById('accessForm');
const accessKeyInput = document.getElementById('accessKey');
const submitButton = document.getElementById('submitButton');
const buttonLabel = document.getElementById('buttonLabel');
const feedback = document.getElementById('feedback');

accessForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  feedback.textContent = '';
  submitButton.disabled = true;
  buttonLabel.textContent = 'Checking key...';

  try {
    const response = await fetch('/api/verify-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: accessKeyInput.value.trim() })
    });
    const result = await response.json();

    if (response.ok && result.success) {
      window.location.assign('/index.html');
      return;
    }

    feedback.className = 'small mt-3 mb-0 text-center text-danger';
    feedback.textContent = result.error || 'Invalid key. Please check your key and try again.';
    if (response.status === 401) window.alert('Invalid key. Please check your key and try again.');
  } catch (error) {
    feedback.className = 'small mt-3 mb-0 text-center text-danger';
    feedback.textContent = 'Could not contact the server. Please try again.';
  } finally {
    submitButton.disabled = false;
    buttonLabel.textContent = 'Verify and continue';
  }
});
