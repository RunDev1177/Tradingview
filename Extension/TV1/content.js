/**
 * TradingView DZ/SZ Signal Scanner - Content Script
 * Monitors TradingView charts, tracks candle close, scans DZ/SZ signals,
 * and sends alerts to the Background Service Worker.
 * Fully compatible with Chrome 109+ (Windows 7) & Manifest V3.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__TV_DZS_ALERT_INJECTED__) return;
  window.__TV_DZS_ALERT_INJECTED__ = true;

  console.log('%c[TV-Alert]%c TradingView DZ/SZ Alert Engine Initialized', 'color: #3b82f6; font-weight: bold;', 'color: inherit;');

  // State
  let config = {
    isRunning: false,
    webhookUrl: '',
    timeframe: '15M',
    chkCandleClose: true,
    chkAttachScreenshot: true,
    chkPlaySound: true,
    dzKeywords: 'DZ, Demand, Buy Zone, Bullish OB',
    szKeywords: 'SZ, Supply, Sell Zone, Bearish OB'
  };

  let lastCheckedBarId = null;
  let lastAlertBarKey = null;
  let keepAlivePort = null;
  let scanIntervalId = null;
  let countdownObserver = null;

  // Initialize Settings
  chrome.storage.local.get(config, (items) => {
    config = { ...config, ...items };
    setupKeepAlive();
    startMonitoringLoop();
  });

  // Listen to Storage Changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    for (const key in changes) {
      if (config.hasOwnProperty(key)) {
        config[key] = changes[key].newValue;
      }
    }
  });

  // Listen to Runtime Messages from Side Panel / Background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    switch (message.type) {
      case 'BOT_STATE_CHANGED':
        config.isRunning = message.isRunning;
        break;

      case 'SETTINGS_UPDATED':
        config = { ...config, ...message.settings };
        break;

      case 'REQUEST_STATUS':
        const status = getChartStatus();
        sendResponse({ success: true, data: status });
        break;

      case 'TRIGGER_MANUAL_SCAN':
        scanForSignals(true);
        sendResponse({ success: true });
        break;
    }
  });

  // =========================================================================
  // Background Keep-Alive (Ensures Service Worker doesn't sleep in MV3)
  // =========================================================================
  function setupKeepAlive() {
    try {
      if (keepAlivePort) {
        keepAlivePort.disconnect();
      }
      keepAlivePort = chrome.runtime.connect({ name: 'tv_keep_alive' });
      keepAlivePort.onDisconnect.addListener(() => {
        keepAlivePort = null;
        setTimeout(setupKeepAlive, 5000);
      });
    } catch (e) {
      setTimeout(setupKeepAlive, 10000);
    }
  }

  // =========================================================================
  // TradingView Data Scrapers
  // =========================================================================
  function getSymbol() {
    // Method 1: Header symbol button
    const symbolBtn = document.querySelector('#header-toolbar-symbol-search button, #header-toolbar-symbol-search, [data-name="legend-source-title"]');
    if (symbolBtn && symbolBtn.textContent.trim()) {
      return symbolBtn.textContent.trim().split(' ')[0];
    }

    // Method 2: Document Title (e.g. "BTCUSDT 65,420.00 — TradingView")
    if (document.title) {
      const match = document.title.match(/^([A-Za-z0-9_:\.\-]+)/);
      if (match && match[1] && !match[1].toLowerCase().includes('tradingview')) {
        return match[1];
      }
    }

    // Method 3: Legend symbol
    const legendTitle = document.querySelector('div[class*="symbolName-"], [data-name="legend-series-title"]');
    if (legendTitle && legendTitle.textContent) {
      return legendTitle.textContent.trim();
    }

    return 'UNKNOWN_SYMBOL';
  }

  function getTimeframe() {
    // Method 1: Interval button in toolbar
    const intervalBtn = document.querySelector('#header-toolbar-intervals button, #header-toolbar-intervals, [data-name="interval-menu"]');
    if (intervalBtn && intervalBtn.textContent.trim()) {
      return intervalBtn.textContent.trim();
    }

    // Method 2: Selected timeframe from settings
    return config.timeframe || '15M';
  }

  function getCurrentPrice() {
    // Method 1: Legend last price
    const legendPrice = document.querySelector('[data-name="legend-last-price"], div[class*="last-price"], div[class*="priceWrapper-"]');
    if (legendPrice && legendPrice.textContent.trim()) {
      return legendPrice.textContent.trim();
    }

    // Method 2: Price axis active price
    const axisPrice = document.querySelector('div[class*="price-axis"] [class*="highlight-"], div[class*="price-axis"] [class*="label-"]');
    if (axisPrice && axisPrice.textContent.trim()) {
      return axisPrice.textContent.trim();
    }

    // Method 3: Parse from document.title
    const titleMatch = document.title.match(/[A-Z0-9_]+\s+([\d,\.]+)/);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1];
    }

    return '-';
  }

  function getCountdownText() {
    // Find Countdown Timer element on Price Scale
    const countdownEl = document.querySelector(
      '[class*="countdown-"], [class*="countdown_"], [data-role="countdown"], div[class*="cell-"][class*="time-"]'
    );
    if (countdownEl && countdownEl.textContent.trim()) {
      return countdownEl.textContent.trim();
    }

    // Fallback: Compute estimated remaining seconds based on selected timeframe
    return computeEstimatedCountdown(config.timeframe);
  }

  function computeEstimatedCountdown(tf) {
    const now = new Date();
    const totalSec = now.getMinutes() * 60 + now.getSeconds();
    let intervalSec = 60; // 1M

    if (tf === '5M' || tf === '5m') intervalSec = 300;
    else if (tf === '15M' || tf === '15m') intervalSec = 900;
    else if (tf === '30M' || tf === '30m') intervalSec = 1800;
    else if (tf === '1H' || tf === '1h' || tf === '60') intervalSec = 3600;
    else if (tf === '4H' || tf === '4h' || tf === '240') intervalSec = 14400;
    else if (tf === '1D' || tf === '1d' || tf === 'D') {
      const msUntilMidnight = 86400000 - (now.getTime() % 86400000);
      const remSec = Math.floor(msUntilMidnight / 1000);
      const hrs = Math.floor(remSec / 3600);
      const mins = Math.floor((remSec % 3600) / 60);
      const secs = remSec % 60;
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    const remainingSec = intervalSec - (totalSec % intervalSec);
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getChartStatus() {
    return {
      symbol: getSymbol(),
      timeframe: getTimeframe(),
      price: getCurrentPrice(),
      countdown: getCountdownText(),
      isRunning: config.isRunning
    };
  }

  // =========================================================================
  // Signal Detection Engine (Demand Zone & Supply Zone)
  // =========================================================================
  function parseKeywords(csvStr) {
    if (!csvStr) return [];
    return csvStr.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
  }

  function scanForSignals(force = false) {
    if (!config.isRunning && !force) return null;

    const dzList = parseKeywords(config.dzKeywords || 'DZ, Demand, Buy Zone, Bullish OB');
    const szList = parseKeywords(config.szKeywords || 'SZ, Supply, Sell Zone, Bearish OB');

    let detectedSignal = null;
    let matchDetails = '';

    // Source 1: Indicator Legend Texts & Values
    const legendItems = document.querySelectorAll(
      '[data-name="legend-source-item"], div[class*="valuesWrapper-"], div[class*="valueItem-"], div[class*="legend-"]'
    );
    for (const item of legendItems) {
      const text = item.textContent.toLowerCase();

      // Check DZ
      for (const kw of dzList) {
        if (text.includes(kw)) {
          detectedSignal = 'DZ';
          matchDetails = `Legend: ${item.textContent.trim().substring(0, 100)}`;
          break;
        }
      }
      if (detectedSignal) break;

      // Check SZ
      for (const kw of szList) {
        if (text.includes(kw)) {
          detectedSignal = 'SZ';
          matchDetails = `Legend: ${item.textContent.trim().substring(0, 100)}`;
          break;
        }
      }
      if (detectedSignal) break;
    }

    // Source 2: Chart SVG Text Elements & Canvas Markers
    if (!detectedSignal) {
      const svgTexts = document.querySelectorAll('svg text, [class*="chart-markup-table"]');
      for (const textEl of svgTexts) {
        const text = textEl.textContent.trim().toLowerCase();
        if (!text) continue;

        for (const kw of dzList) {
          if (text === kw || text.includes(kw)) {
            detectedSignal = 'DZ';
            matchDetails = `Chart Label: ${textEl.textContent.trim()}`;
            break;
          }
        }
        if (detectedSignal) break;

        for (const kw of szList) {
          if (text === kw || text.includes(kw)) {
            detectedSignal = 'SZ';
            matchDetails = `Chart Label: ${textEl.textContent.trim()}`;
            break;
          }
        }
        if (detectedSignal) break;
      }
    }

    // Source 3: Data Window (if open)
    if (!detectedSignal) {
      const dataWindow = document.querySelector('[data-name="data-window"]');
      if (dataWindow) {
        const text = dataWindow.textContent.toLowerCase();
        for (const kw of dzList) {
          if (text.includes(kw)) {
            detectedSignal = 'DZ';
            matchDetails = 'Data Window Match';
            break;
          }
        }
        if (!detectedSignal) {
          for (const kw of szList) {
            if (text.includes(kw)) {
              detectedSignal = 'SZ';
              matchDetails = 'Data Window Match';
              break;
            }
          }
        }
      }
    }

    // Return result
    if (detectedSignal) {
      return {
        type: detectedSignal,
        symbol: getSymbol(),
        timeframe: getTimeframe(),
        price: getCurrentPrice(),
        details: matchDetails,
        time: new Date().toLocaleTimeString('th-TH', { hour12: false }),
        timestamp: Date.now()
      };
    }

    return null;
  }

  // =========================================================================
  // Candle Close Evaluation & Trigger
  // =========================================================================
  function getBarKey(tf) {
    const now = new Date();
    let bucket = 60000;
    if (tf === '5M' || tf === '5m') bucket = 300000;
    else if (tf === '15M' || tf === '15m') bucket = 900000;
    else if (tf === '30M' || tf === '30m') bucket = 1800000;
    else if (tf === '1H' || tf === '1h') bucket = 3600000;
    else if (tf === '4H' || tf === '4h') bucket = 14400000;
    else if (tf === '1D' || tf === '1d') bucket = 86400000;

    return Math.floor(now.getTime() / bucket);
  }

  function onCandleCloseEvent() {
    if (!config.isRunning) return;

    const currentBarKey = getBarKey(config.timeframe);

    // Prevent duplicate alert for the same closed bar
    if (lastAlertBarKey === currentBarKey) {
      return;
    }

    console.log('[TV-Alert] Candle closed! Scanning for DZ/SZ signals...');

    const signal = scanForSignals(false);
    if (signal) {
      lastAlertBarKey = currentBarKey;
      dispatchSignalAlert(signal);
    }
  }

  function dispatchSignalAlert(signal) {
    console.log('[TV-Alert] 🚀 Dispatching Signal:', signal);

    // Send to background service worker to send Discord Webhook & Capture Screenshot
    chrome.runtime.sendMessage({
      type: 'SIGNAL_DETECTED',
      signal: signal,
      attachScreenshot: config.chkAttachScreenshot !== false
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[TV-Alert] Error sending signal message:', chrome.runtime.lastError);
      }
    });

    // Save as last signal in storage
    chrome.storage.local.set({ lastSignal: signal });
  }

  // =========================================================================
  // Monitoring Loop & Countdown Watcher
  // =========================================================================
  let prevCountdownSec = -1;

  function startMonitoringLoop() {
    if (scanIntervalId) clearInterval(scanIntervalId);

    scanIntervalId = setInterval(() => {
      const status = getChartStatus();

      // Broadcast status update to side panel
      chrome.runtime.sendMessage({
        type: 'STATUS_UPDATE',
        data: status
      }).catch(() => {});

      if (!config.isRunning) return;

      // Check for candle close via countdown timer
      const countdownStr = status.countdown || '';
      const parts = countdownStr.split(':').map(n => parseInt(n, 10));

      if (parts.length >= 2) {
        const totalSecRemaining = parts.length === 3
          ? parts[0] * 3600 + parts[1] * 60 + parts[2]
          : parts[0] * 60 + parts[1];

        // If timer reached 0 or reset after counting down to 1s -> Candle Closed!
        if (totalSecRemaining === 0 || (prevCountdownSec === 1 && totalSecRemaining > 1)) {
          onCandleCloseEvent();
        }

        prevCountdownSec = totalSecRemaining;
      }

      // If user unchecked "Check on Candle Close only", scan continuously every 5 seconds
      if (!config.chkCandleClose) {
        const currentBarKey = getBarKey(config.timeframe);
        if (lastAlertBarKey !== currentBarKey) {
          const signal = scanForSignals(false);
          if (signal) {
            lastAlertBarKey = currentBarKey;
            dispatchSignalAlert(signal);
          }
        }
      }
    }, 1000);
  }

})();
