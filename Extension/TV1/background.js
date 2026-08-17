/**
 * TradingView DZ/SZ Alert - Background Service Worker
 * Handles Discord Webhook dispatching, screenshot capturing, alarms,
 * and keep-alive ports for continuous background execution.
 * Compatible with Chrome 109+ (Windows 7) & Manifest V3.
 */

// Configure Side Panel behavior if supported (Chrome 114+)
if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.log('[Background] SidePanel setPanelBehavior note:', err);
  });
}

// Keep-Alive connection port
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'tv_keep_alive') {
    port.onMessage.addListener(() => {});
    port.onDisconnect.addListener(() => {});
  }
});

// Periodic Alarms to ensure Background worker stays reactive
chrome.alarms.create('tv_heartbeat_alarm', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tv_heartbeat_alarm') {
    // Heartbeat tick
  }
});

// Listen to Messages from Content Script & Side Panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'SIGNAL_DETECTED':
      handleSignalDetected(message.signal, message.attachScreenshot, sender);
      sendResponse({ received: true });
      break;

    case 'SEND_TEST_ALERT':
      handleSendTestAlert(message.symbol || 'BTCUSDT', message.timeframe || '15M')
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // Keep message channel open for async response
  }
});

// =========================================================================
// Signal & Alert Handlers
// =========================================================================
async function handleSignalDetected(signal, attachScreenshot, sender) {
  if (!signal) return;

  console.log('[Background] Processing Signal:', signal);

  // Retrieve stored settings
  const settings = await getStoredSettings();
  if (!settings.webhookUrl) {
    logToUI('ไม่สามารถส่งแจ้งเตือนได้: ยังไม่ได้ตั้งค่า Discord Webhook URL', 'error');
    return;
  }

  // Save last signal to storage
  chrome.storage.local.set({ lastSignal: signal });

  // Broadcast to open sidepanel/popup
  chrome.runtime.sendMessage({
    type: 'NEW_SIGNAL',
    data: signal
  }).catch(() => {});

  // Try capturing screenshot of TradingView tab
  let screenshotBlob = null;
  if (attachScreenshot && sender && sender.tab) {
    try {
      screenshotBlob = await captureTabScreenshot(sender.tab.windowId);
    } catch (e) {
      console.warn('[Background] Screenshot capture skipped:', e.message);
    }
  }

  // Send Discord Webhook
  try {
    await sendDiscordWebhook({
      webhookUrl: settings.webhookUrl,
      signal: signal,
      screenshotBlob: screenshotBlob,
      isTest: false
    });

    const signalName = signal.type === 'DZ' ? 'DEMAND ZONE (DZ)' : 'SUPPLY ZONE (SZ)';
    logToUI(`ส่งแจ้งเตือน ${signalName} เข้า Discord สำเร็จ! [${signal.symbol} | ${signal.timeframe}]`, 'info');
  } catch (err) {
    console.error('[Background] Webhook error:', err);
    logToUI(`ส่งแจ้งเตือนเข้า Discord ล้มเหลว: ${err.message}`, 'error');
  }
}

async function handleSendTestAlert(symbol, timeframe) {
  const settings = await getStoredSettings();
  if (!settings.webhookUrl) {
    throw new Error('กรุณาระบุ Discord Webhook URL ก่อนทดสอบ');
  }

  const testSignal = {
    type: 'DZ',
    symbol: symbol || 'BTCUSDT',
    timeframe: timeframe || '15M',
    price: '68,450.00',
    details: 'Test Signal Simulation (Demand Zone Detection Test)',
    time: new Date().toLocaleTimeString('th-TH', { hour12: false }),
    timestamp: Date.now()
  };

  // Try capturing screenshot of current active tab
  let screenshotBlob = null;
  if (settings.chkAttachScreenshot !== false) {
    try {
      const activeTabs = await queryTabs({ active: true, currentWindow: true });
      if (activeTabs && activeTabs[0]) {
        screenshotBlob = await captureTabScreenshot(activeTabs[0].windowId);
      }
    } catch (e) {
      console.warn('[Background] Test screenshot capture skipped:', e.message);
    }
  }

  await sendDiscordWebhook({
    webhookUrl: settings.webhookUrl,
    signal: testSignal,
    screenshotBlob: screenshotBlob,
    isTest: true
  });

  return { success: true };
}

// =========================================================================
// Discord Webhook Formatter & Sender
// =========================================================================
async function sendDiscordWebhook({ webhookUrl, signal, screenshotBlob, isTest }) {
  if (!webhookUrl || !webhookUrl.startsWith('http')) {
    throw new Error('รูปแบบ Discord Webhook URL ไม่ถูกต้อง');
  }

  const isDZ = signal.type === 'DZ';
  const color = isTest ? 0x8B5CF6 : (isDZ ? 0x10B981 : 0xEF4444);
  const typeLabel = isTest ? '⚡ TEST SIGNAL' : (isDZ ? '🟢 DEMAND ZONE (DZ)' : '🔴 SUPPLY ZONE (SZ)');
  const thaiTimeStr = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour12: false,
    dateStyle: 'medium',
    timeStyle: 'medium'
  });

  const chartUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(signal.symbol || 'BTCUSDT')}`;

  const embed = {
    title: `${typeLabel} — ${signal.symbol || 'TradingView'}`,
    url: chartUrl,
    color: color,
    description: isTest
      ? `🔔 **ทดสอบการเชื่อมต่อระบบแจ้งเตือน**\nระบบสามารถตรวจจับและส่งการแจ้งเตือนเข้า Discord ได้อย่างสมบูรณ์`
      : `🎯 **เกิดสัญญาณ ${isDZ ? 'Demand Zone' : 'Supply Zone'} เมื่อแท่งเทียนปิด**`,
    fields: [
      {
        name: '🏷️ Symbol',
        value: `\`${signal.symbol || '-'}\``,
        inline: true
      },
      {
        name: '⏱️ Timeframe',
        value: `\`${signal.timeframe || '-'}\``,
        inline: true
      },
      {
        name: '💰 Close Price',
        value: `\`${signal.price || '-'}\``,
        inline: true
      },
      {
        name: '🕒 เวลาที่เกิดสัญญาณ',
        value: `${thaiTimeStr} (GMT+7)`,
        inline: false
      }
    ],
    footer: {
      text: 'TradingView DZ/SZ Alert Bot • Background Engine',
      icon_url: 'https://cdn-icons-png.flaticon.com/512/2965/2965313.png'
    },
    timestamp: new Date().toISOString()
  };

  if (signal.details) {
    embed.fields.push({
      name: '🔍 ข้อมูล Indicator',
      value: `\`\`\`${signal.details.substring(0, 500)}\`\`\``,
      inline: false
    });
  }

  // If screenshot is available, attach as image
  if (screenshotBlob) {
    embed.image = {
      url: 'attachment://chart_snapshot.png'
    };

    const formData = new FormData();
    const payload = {
      username: 'TradingView DZ/SZ Alert',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/2965/2965313.png',
      embeds: [embed]
    };

    formData.append('payload_json', JSON.stringify(payload));
    formData.append('files[0]', screenshotBlob, 'chart_snapshot.png');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Discord API ตอบกลับสถานะ ${response.status}: ${errText}`);
    }
  } else {
    // Send as JSON
    const payload = {
      username: 'TradingView DZ/SZ Alert',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/2965/2965313.png',
      embeds: [embed]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Discord API ตอบกลับสถานะ ${response.status}: ${errText}`);
    }
  }
}

// =========================================================================
// Screenshot Capture Helper
// =========================================================================
async function captureTabScreenshot(windowId) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.captureVisibleTab(
        windowId || null,
        { format: 'png' },
        (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            return reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Cannot capture tab'));
          }

          // Convert Data URL to Blob
          try {
            const byteString = atob(dataUrl.split(',')[1]);
            const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeString });
            resolve(blob);
          } catch (err) {
            reject(err);
          }
        }
      );
    } catch (e) {
      reject(e);
    }
  });
}

// =========================================================================
// Storage & Tabs Helpers
// =========================================================================
function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({
      webhookUrl: '',
      timeframe: '15M',
      chkCandleClose: true,
      chkAttachScreenshot: true,
      chkPlaySound: true,
      dzKeywords: 'DZ, Demand, Buy Zone, Bullish OB',
      szKeywords: 'SZ, Supply, Sell Zone, Bearish OB',
      isRunning: false
    }, (items) => {
      resolve(items);
    });
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      resolve(tabs || []);
    });
  });
}

function logToUI(text, level = 'info') {
  chrome.runtime.sendMessage({
    type: 'LOG_ENTRY',
    text: text,
    level: level
  }).catch(() => {});
}
