
const BACKEND_URL = 'http://localhost:3000';

// Element References
const imageInput    = document.getElementById('imageInput');
const synthesizeBtn = document.getElementById('synthesizeBtn');
const terminal      = document.getElementById('code-terminal');
const previewImage  = document.getElementById('previewImage');
const historyGrid   = document.getElementById('historyGrid');

if (!imageInput || !synthesizeBtn || !terminal || !previewImage || !historyGrid) {
  throw new Error('Missing required UI elements. Check index.html IDs.');
}

// it is a status bar
function setStatus(state, msg) {
  const statusDot  = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  statusDot.className = 'status-dot ' + state;
  statusText.textContent = msg;
}

// for imaging things
imageInput.onchange = () => {
  const file = imageInput.files[0];
  if (file) {
    previewImage.src = URL.createObjectURL(file);
    previewImage.style.display = 'block';
    previewImage.classList.add('loaded');

    const placeholder = document.getElementById('previewPlaceholder');
    if (placeholder) placeholder.classList.add('hidden');

    terminal.value = ">>> Image loaded. Ready for synthesis.";
    synthesizeBtn.disabled = false;
    setStatus('idle', `loaded: ${file.name}`);

    const uploadText = document.querySelector('.upload-area p:first-of-type');
    if (uploadText) uploadText.innerHTML = '<strong>Upload new image?</strong> or drag & drop';
  }
};

// Some of the code for Ai synthesis so that it triggers and stuff
synthesizeBtn.onclick = async () => {
  if (!imageInput.files[0]) return alert("Please upload a circuit sketch");

  synthesizeBtn.disabled = true;
  terminal.value = ">>> System: Fetching credentials...\n>>> System: Analyzing Logic Gates...";
  setStatus('busy', 'synthesizing...');

  const reader = new FileReader();
  reader.readAsDataURL(imageInput.files[0]);
  reader.onerror = () => {
    terminal.value = '>>> Critical Error: Could not read image file.';
    setStatus('idle', 'file read error');
    synthesizeBtn.disabled = false;
  };
  reader.onload = async () => {
    const base64Image = reader.result.split(',')[1];
    const mimeType = imageInput.files[0].type;

    try {
      const response = await fetch(`${BACKEND_URL}/api/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Image, mimeType })
      });

      if (!response.ok) {
        let details = '';
        try {
          const errJson = await response.json();
          details = errJson.details || errJson.error || '';
        } catch (_) {
          details = await response.text();
        }
        throw new Error(`API Error: ${response.status}${details ? ` - ${details}` : ''}`);
      }
      const data = await response.json();

      if (data.verilog) {
        terminal.value = data.verilog.replace(/\\n/g, '\n');
        setStatus('idle', 'synthesis complete');
        addHistoryCard(previewImage.src, data.verilog);
      } else {
        terminal.value = ">>> System: No response content found.";
        setStatus('idle', 'no response');
        console.log(data);
      }
    } catch (error) {
      terminal.value = `>>> Critical Error: ${error.message}`;
      setStatus('idle', 'error — check console');
      console.error(error);
    } finally {
      synthesizeBtn.disabled = false;
    }
  };
};

//History Section
function addHistoryCard(imageURL, verilogCode) {
  const count = historyGrid.children.length + 1;

  const card = document.createElement('div');
  card.className = 'history-card';

  card.innerHTML = `
    <img src="${imageURL}" alt="Sketch ${count}" />
    <div class="history-card-body">
      <input class="history-card-name" value="Synthesis ${count}" />
      <div class="history-card-actions">
        <button class="btn-view">View</button>
        <button class="btn-delete">Delete</button>
      </div>
    </div>
  `;

  card.querySelector('.btn-view').onclick = () => {
    terminal.value = verilogCode;
    previewImage.src = imageURL;
    previewImage.classList.add('loaded');
    const placeholder = document.getElementById('previewPlaceholder');
    if (placeholder) placeholder.classList.add('hidden');
    setStatus('idle', 'viewing previous synthesis');
  };

  card.querySelector('.btn-delete').onclick = () => {
    card.remove();
  };

  historyGrid.appendChild(card);
}

// Key Panel Toggle
const keyBtn = document.getElementById('keyBtn');
const keyPanel = document.getElementById('keyPanel');
if (keyBtn && keyPanel) {
  keyBtn.onclick = () => {
    keyPanel.classList.toggle('visible');
  };
}

//Copy Output Button
const copyBtn = document.querySelector('.terminal-copy-btn');
if (copyBtn) {
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(terminal.value || '');
      setStatus('idle', 'copied to clipboard');
    } catch (_) {
      setStatus('idle', 'copy failed');
    }
  };
}
// this is the part where you cick outside and then it goes away
document.addEventListener('click', (e) => {
  const keyPanel = document.getElementById('keyPanel');
  const keyBtn   = document.getElementById('keyBtn');
  
  if (!keyPanel.contains(e.target) && !keyBtn.contains(e.target)) {
    keyPanel.classList.remove('visible');
  }
});