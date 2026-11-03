// Clean Chat Interface Logic with In-Bubble Suggested Chips
const sessionId = 'session_' + Math.random().toString(36).substring(2, 9);

// Vercel Web Analytics tracking helper
window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
function trackEvent(name, data = {}) {
  try {
    if (typeof window.va === 'function') {
      window.va('event', { name, ...data });
    }
  } catch (e) {}
}

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const resetBtn = document.getElementById('reset-btn');

// Start chat when page loads
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  sendMessage('', true);
});

function setupEventListeners() {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = userInput.value.trim();
    if (msg) {
      sendMessage(msg);
      userInput.value = '';
    }
  });

  resetBtn.addEventListener('click', () => {
    resetSession();
  });
}

async function sendMessage(text, isInitial = false) {
  if (!isInitial && text) {
    appendMessage('user', text);
  }

  userInput.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text })
    });

    const data = await res.json();
    appendMessage('bot', data.text, data.products || [], data.chips || []);

    if (data.stage === 'QUALIFIED' && data.leadSummary) {
      trackEvent('lead_qualified', {
        category: data.leadSummary.category,
        model: data.leadSummary.selectedProduct || 'General'
      });
    }

  } catch (err) {
    console.error('Chat error:', err);
    appendMessage('bot', 'Sorry, I encountered a temporary connection issue. Please try again or call our sales desk at **7942534248**.');
  } finally {
    userInput.disabled = false;
    userInput.focus();
  }
}

async function resetSession() {
  try {
    await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    chatMessages.innerHTML = '';
    sendMessage('', true);
  } catch (err) {
    console.error('Reset error:', err);
  }
}

function appendMessage(sender, text, products = [], chips = []) {
  // Before adding a new message, deactivate chip buttons on previous messages
  if (sender === 'user' || sender === 'bot') {
    document.querySelectorAll('.bubble-chips:not(.disabled)').forEach(el => {
      el.classList.add('disabled');
    });
  }

  const row = document.createElement('div');
  row.className = `message-row ${sender}-row`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = formatMarkdown(text);

  // 1. Render in-chat product cards (if any)
  if (products && products.length > 0) {
    const shelf = document.createElement('div');
    shelf.className = 'products-shelf';

    products.forEach(p => {
      const pCard = document.createElement('div');
      pCard.className = 'product-card';

      const imgHtml = p.imageUrl 
        ? `<img class="product-img" src="${p.imageUrl}" alt="${p.displayName}" loading="lazy">`
        : `<div class="product-img" style="display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px;">No Image</div>`;

      pCard.innerHTML = `
        ${imgHtml}
        <div class="product-details">
          <div class="product-title" title="${p.displayName}">${p.displayName}</div>
          <div class="product-links">
            <a href="${p.url}" target="_blank" class="product-btn">Website ↗</a>
            <button type="button" class="product-btn primary select-btn" data-name="${p.displayName}">Select</button>
          </div>
        </div>
      `;

      pCard.querySelector('.select-btn').addEventListener('click', () => {
        shelf.querySelectorAll('.select-btn').forEach(btn => {
          btn.disabled = true;
          btn.style.opacity = '0.5';
          btn.style.cursor = 'default';
        });
        pCard.classList.add('selected');
        trackEvent('product_selected', { product: p.displayName });
        sendMessage(`Select ${p.displayName}`);
      });

      shelf.appendChild(pCard);
    });

    bubble.appendChild(shelf);
  }

  // 2. Render Suggested Chips directly INSIDE the last message bubble
  if (sender === 'bot' && chips && chips.length > 0) {
    const chipsWrapper = document.createElement('div');
    chipsWrapper.className = 'bubble-chips';

    chips.forEach(chipText => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-btn';
      btn.textContent = chipText;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        chipsWrapper.classList.add('disabled');
        trackEvent('chip_clicked', { chip: chipText });
        sendMessage(chipText);
      });
      chipsWrapper.appendChild(btn);
    });

    bubble.appendChild(chipsWrapper);
  }

  // Timestamp
  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  bubble.appendChild(time);

  row.appendChild(bubble);
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, title, href) => {
      if (href.startsWith('tel:')) {
        return `<a href="${href}" class="contact-link">${title}</a>`;
      }
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${title} ↗</a>`;
    });

  // Convert bullet points
  html = html.replace(/^[•\-\*]\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>(\n|))+/g, match => '<ul>' + match.replace(/\n/g, '') + '</ul>');
  
  html = html.replace(/\n\n/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<br><ul>/g, '<ul>');
  html = html.replace(/<\/ul><br>/g, '</ul>');
  return html;
}
