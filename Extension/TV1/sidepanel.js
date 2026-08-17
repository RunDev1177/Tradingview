/**
 * TradingView DZ/SZ Alert - Side Panel UI Logic
 * Compatible with Chrome 109+ (Windows 7) & Manifest V3
 */

(function () {
  'use strict';

  // DOM Elements
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const btnPlay = document.getElementById('btnPlay');
  const btnStop = document.getElementById('btnStop');
  const btnTest = document.getElementById('btnTest');
  const btnPopout = document.getElementById('btnPopout');

  const tabConnectedBadge = document.getElementById('tabConnectedBadge');
  const liveSymbol = document.getElementById('liveSymbol');
  const liveTimeframe = document.getElementById('liveTimeframe');
  const liveCountdown = document.getElementById('liveCountdown');
  const livePrice = document.getElementById('livePrice');
  const lastSignalBox = document.getElementById('lastSignalBox');
  const lastSignalText = document.getElementById('lastSignalText');

  const settingsForm = document.getElementById('settingsForm');
  const webhookUrlInput = document.getElementById('webhookUrl');
  const btnToggleWebhook = document.getElementById('btnToggleWebhook');
  const timeframePills = document.querySelectorAll('.tf-pill');
  const selectedTimeframeInput = document.getElementById('selectedTimeframe');
  const chkCandleClose = document.getElementById('chkCandleClose');
  const chkAttachScreenshot = document.getElementById('chkAttachScreenshot');
  const chkPlaySound = document.getElementById('chkPlaySound');
  const dzKeywordsInput = document.getElementById('dzKeywords');
  const szKeywordsInput = document.getElementById('szKeywords');
  const btnCancel = document.getElementById('btnCancel');

  const logContainer = document.getElementById('logContainer');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const toast = document.getElementById('toast');

  // Default Settings
  const DEFAULT_SETTINGS = {
    webhookUrl: '',
    timeframe: '15M',
    chkCandleClose: true,
    chkAttachScreenshot: true,
    chkPlaySound: true,
    dzKeywords: 'DZ, Demand, Buy Zone, Bullish OB',
    szKeywords: 'SZ, Supply, Sell Zone, Bearish OB',
    isRunning: false,
    logs: []
  };

  let currentSettings = { ...DEFAULT_SETTINGS };

  // ==========================================
  // Initialization
  // ==========================================
  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    setupEventListeners();
    setupTimeframePills();
    requestActiveTabStatus();
    startUiPolling();
  });

  // ==========================================
  // Settings Management
  // ==========================================
  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
        currentSettings = items || DEFAULT_SETTINGS;
        applySettingsToUI(currentSettings);
        resolve();
      });
    });
  }

  function applySettingsToUI(settings) {
    webhookUrlInput.value = settings.webhookUrl || '';
    selectedTimeframeInput.value = settings.timeframe || '15M';
    chkCandleClose.checked = settings.chkCandleClose !== false;
    chkAttachScreenshot.checked = settings.chkAttachScreenshot !== false;
    chkPlaySound.checked = settings.chkPlaySound !== false;
    dzKeywordsInput.value = settings.dzKeywords || DEFAULT_SETTINGS.dzKeywords;
    szKeywordsInput.value = settings.szKeywords || DEFAULT_SETTINGS.szKeywords;

    // Update Timeframe Pill Active Class
    timeframePills.forEach(pill => {
      if (pill.getAttribute('data-tf') === settings.timeframe) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    // Update Bot Running Status
    updateRunningState(settings.isRunning);

    // Update Last Signal if available
    if (settings.lastSignal) {
      displayLastSignal(settings.lastSignal);
    }

    // Render Logs
    if (Array.isArray(settings.logs) && settings.logs.length > 0) {
      renderLogs(settings.logs);
    }
  }

  function saveSettings() {
    const newSettings = {
      webhookUrl: webhookUrlInput.value.trim(),
      timeframe: selectedTimeframeInput.value,
      chkCandleClose: chkCandleClose.checked,
      chkAttachScreenshot: chkAttachScreenshot.checked,
      chkPlaySound: chkPlaySound.checked,
      dzKeywords: dzKeywordsInput.value.trim(),
      szKeywords: szKeywordsInput.value.trim()
    };

    chrome.storage.local.set(newSettings, () => {
      currentSettings = { ...currentSettings, ...newSettings };
      showToast('บันทึกการตั้งค่าเรียบร้อย');
      addLog('บันทึกการตั้งค่าเรียบร้อยแล้ว', 'info');

      // Notify content script & background
      broadcastMessage({ type: 'SETTINGS_UPDATED', settings: newSettings });
    });
  }

  function cancelSettings() {
    applySettingsToUI(currentSettings);
    showToast('รีเซ็ตการตั้งค่าเรียบร้อย');
  }

  // ==========================================
  // UI Interactions & Controls
  // ==========================================
  function setupEventListeners() {
    // Save & Cancel
    settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveSettings();
    });

    btnCancel.addEventListener('click', () => {
      cancelSettings();
    });

    // Toggle Webhook Password Visibility
    btnToggleWebhook.addEventListener('click', () => {
      if (webhookUrlInput.type === 'password') {
        webhookUrlInput.type = 'text';
      } else {
        webhookUrlInput.type = 'password';
      }
    });

    // Play Button
    btnPlay.addEventListener('click', () => {
      const webhook = webhookUrlInput.value.trim();
      if (!webhook) {
        showToast('กรุณาระบุ Discord Webhook URL ก่อนเริ่มทำงาน');
        webhookUrlInput.focus();
        return;
      }

      saveSettings();
      setRunningState(true);
    });

    // Stop Button
    btnStop.addEventListener('click', () => {
      setRunningState(false);
    });

    // Test Button
    btnTest.addEventListener('click', () => {
      const webhook = webhookUrlInput.value.trim();
      if (!webhook) {
        showToast('กรุณาระบุ Discord Webhook URL ก่อนกด Test');
        webhookUrlInput.focus();
        return;
      }

      showToast('กำลังส่งสัญญาณทดสอบเข้า Discord...');
      addLog('กำลังส่งสัญญาณทดสอบเข้า Discord Webhook...', 'info');

      chrome.runtime.sendMessage({
        type: 'SEND_TEST_ALERT',
        timeframe: selectedTimeframeInput.value,
        symbol: liveSymbol.textContent !== '-' ? liveSymbol.textContent : 'BTCUSDT'
      }, (response) => {
        if (chrome.runtime.lastError) {
          addLog('ส่งข้อความทดสอบล้มเหลว: ' + chrome.runtime.lastError.message, 'error');
        } else if (response && response.success) {
          showToast('ส่งสัญญาณทดสอบเข้า Discord สำเร็จ!');
          addLog('ส่งสัญญาณทดสอบเข้า Discord สำเร็จ', 'info');
          if (chkPlaySound.checked) playSignalSound();
        } else {
          addLog('ส่งข้อความทดสอบล้มเหลว: ' + (response ? response.error : 'Unknown Error'), 'error');
        }
      });
    });

    // Pop-out Window (Especially useful for Windows 7)
    btnPopout.addEventListener('click', () => {
      if (chrome.windows && chrome.windows.create) {
        chrome.windows.create({
          url: chrome.runtime.getURL('sidepanel.html'),
          type: 'popup',
          width: 380,
          height: 640,
          top: 100,
          left: 100
        });
      }
    });

    // Clear Logs
    btnClearLogs.addEventListener('click', () => {
      chrome.storage.local.set({ logs: [] }, () => {
        logContainer.innerHTML = '';
        addLog('ล้างประวัติการทำงานเรียบร้อย', 'info');
      });
    });

    // Chrome Runtime Message Listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.type) return;

      switch (message.type) {
        case 'STATUS_UPDATE':
          handleStatusUpdate(message.data);
          break;
        case 'NEW_SIGNAL':
          handleNewSignal(message.data);
          break;
        case 'LOG_ENTRY':
          addLog(message.text, message.level);
          break;
      }
    });

    // Storage Changes (Sync across tabs/windows)
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.isRunning !== undefined) {
        updateRunningState(changes.isRunning.newValue);
      }
      if (changes.lastSignal !== undefined) {
        displayLastSignal(changes.lastSignal.newValue);
      }
    });
  }

  function setupTimeframePills() {
    timeframePills.forEach(pill => {
      pill.addEventListener('click', () => {
        timeframePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const tf = pill.getAttribute('data-tf');
        selectedTimeframeInput.value = tf;
        addLog(`เปลี่ยน TimeFrame เป็น ${tf}`, 'info');
      });
    });
  }

  // ==========================================
  // Bot State Management
  // ==========================================
  function setRunningState(isRunning) {
    chrome.storage.local.set({ isRunning }, () => {
      currentSettings.isRunning = isRunning;
      updateRunningState(isRunning);

      if (isRunning) {
        showToast('บอทเริ่มทำงานในเบื้องหลังแล้ว');
        addLog('บอทเริ่มทำงานในเบื้องหลัง (Background Active)', 'info');
      } else {
        showToast('หยุดการทำงานของบอท');
        addLog('หยุดการทำงานของบอทแล้ว', 'warn');
      }

      broadcastMessage({ type: 'BOT_STATE_CHANGED', isRunning });
    });
  }

  function updateRunningState(isRunning) {
    if (isRunning) {
      statusBadge.className = 'status-badge status-running';
      statusText.textContent = 'RUNNING';
      btnPlay.style.opacity = '0.6';
      btnPlay.disabled = true;
      btnStop.style.opacity = '1';
      btnStop.disabled = false;
    } else {
      statusBadge.className = 'status-badge status-stopped';
      statusText.textContent = 'STOPPED';
      btnPlay.style.opacity = '1';
      btnPlay.disabled = false;
      btnStop.style.opacity = '0.6';
      btnStop.disabled = true;
    }
  }

  // ==========================================
  // Chart Status & Signals Display
  // ==========================================
  function handleStatusUpdate(data) {
    if (!data) return;

    tabConnectedBadge.className = 'badge badge-connected';
    tabConnectedBadge.textContent = 'Online';

    if (data.symbol) liveSymbol.textContent = data.symbol;
    if (data.timeframe) liveTimeframe.textContent = data.timeframe;
    if (data.price) livePrice.textContent = data.price;
    if (data.countdown) liveCountdown.textContent = data.countdown;
  }

  function handleNewSignal(signal) {
    if (!signal) return;
    displayLastSignal(signal);

    const typeName = signal.type === 'DZ' ? 'DEMAND ZONE (DZ)' : 'SUPPLY ZONE (SZ)';
    const logType = signal.type === 'DZ' ? 'dz' : 'sz';
    addLog(`🚨 ตรวจพบสัญญาณ ${typeName} | Symbol: ${signal.symbol} | Price: ${signal.price}`, logType);

    if (chkPlaySound.checked) {
      playSignalSound();
    }
  }

  function displayLastSignal(signal) {
    if (!signal) return;
    const isDZ = signal.type === 'DZ';
    lastSignalText.textContent = `${isDZ ? '🟢 DZ (Demand)' : '🔴 SZ (Supply)'} @ ${signal.price || '-'} (${signal.time || ''})`;
    lastSignalText.className = isDZ ? 'last-signal-value signal-dz' : 'last-signal-value signal-sz';
  }

  // ==========================================
  // Logs & Notification Helpers
  // ==========================================
  function addLog(text, level = 'info') {
    const timeStr = new Date().toLocaleTimeString('th-TH', { hour12: false });
    const logItem = { time: timeStr, text, level };

    appendLogToDOM(logItem);

    // Save to storage (keep last 50 entries)
    chrome.storage.local.get({ logs: [] }, (res) => {
      const logs = res.logs || [];
      logs.push(logItem);
      if (logs.length > 50) logs.shift();
      chrome.storage.local.set({ logs });
    });
  }

  function appendLogToDOM(item) {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${item.level || 'info'}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = item.time;

    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';
    msgSpan.textContent = item.text;

    entry.appendChild(timeSpan);
    entry.appendChild(msgSpan);

    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function renderLogs(logs) {
    logContainer.innerHTML = '';
    logs.forEach(item => appendLogToDOM(item));
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  function playSignalSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15); // E6

      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn('Cannot play audio context beep:', e);
    }
  }

  function broadcastMessage(msg) {
    chrome.tabs.query({ url: '*://*.tradingview.com/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
        });
      }
    });
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  function requestActiveTabStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes('tradingview.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_STATUS' }, (response) => {
          if (response && response.data) {
            handleStatusUpdate(response.data);
          }
        });
      }
    });
  }

  function startUiPolling() {
    setInterval(() => {
      requestActiveTabStatus();
    }, 2000);
  }

})();
