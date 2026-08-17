# TradingView DZ/SZ Discord Alert (Chrome Extension)

ส่วนขยาย Google Chrome Extension (Manifest V3) รูปแบบ **Side Panel** สำหรับตรวจจับสัญญาณ **Demand Zone (DZ)** และ **Supply Zone (SZ)** บนหน้ากราฟ TradingView เมื่อแท่งเทียนปิด (Candle Close) และส่งการแจ้งเตือนไปยัง **Discord Webhook** แบบอัตโนมัติ พร้อมภาพแคปหน้าจอกราฟแบบเรียลไทม์

> **✨ จุดเด่นสำคัญ:**
> - ⚡ **ทำงานเบื้องหลังตลอดเวลา (True Background Monitoring)** แม้พับหน้าต่างหรือปิดแถบ Side Panel
> - 🪟 **รองรับ Windows 7 (Chrome 109+)** และเบราว์เซอร์ Chromium รุ่นเก่า สามารถเปิดเป็น Action Popup หรือ Pop-out Window แยกได้
> - 🎨 **UI โทนสีดำ (Dark Theme)** สไตล์ Glassmorphism ระดับพรีเมียม สบายตา ใช้งานง่าย

---

## 🚀 ฟังก์ชันการทำงานหลัก (Features)

1. **ปุ่มควบคุมหลัก**:
   - **Play (เขียว)**: เริ่มต้นการทำงานของบอทในเบื้องหลัง
   - **Stop (แดง)**: หยุดการทำงานของบอท
   - **Test (ม่วง)**: ทดสอบส่งสัญญาณตัวอย่าง พร้อมภาพแคปกราฟเข้า Discord ทันที
2. **การตั้งค่า**:
   - **Discord Webhook URL**: ช่องใส่ URL พร้อมปุ่มเปิด/ปิดซ่อนรหัสผ่าน
   - **Timeframe Selector**: เลือก Timeframe `1M`, `5M`, `15M`, `30M`, `1H`, `4H`, `1D`
   - **ตัวเลือกเสริม**:
     - ตรวจสอบเฉพาะเมื่อแท่งเทียนปิด (Candle Close)
     - แนบรูปถ่ายหน้าจอกราฟเข้า Discord (Chart Snapshot)
     - เปิดเสียงแจ้งเตือนในเบราว์เซอร์ (Sound Alert)
     - ปรับแต่งคำค้นหาสัญญาณ DZ / SZ เพิ่มเติมได้อิสระ
   - **ปุ่ม บันทึก / ยกเลิก**: บันทึกการตั้งค่าลงเครื่อง
3. **Live Dashboard & Countdown**:
   - แสดง Symbol, Timeframe และราคาล่าสุดของหน้ากราฟ TradingView
   - ตัวจับเวลานับถอยหลังการปิดแท่งเทียน (Candle Countdown Timer) แบบ Real-time
   - แสดงสัญญาณ DZ / SZ ล่าสุดที่ตรวจพบพร้อมบันทึก Activity Log

---

## 📦 วิธีการติดตั้งและใช้งาน (Installation Guide)

### ขั้นตอนที่ 1: โหลด Extension เข้า Chrome
1. เปิดเบราว์เซอร์ Google Chrome
2. พิมพ์ `chrome://extensions` ในช่อง URL แล้วกด Enter
3. เปิดสวิตช์ **Developer mode (โหมดนักพัฒนา)** ที่มุมบนขวา
4. คลิกปุ่ม **Load unpacked (โหลดส่วนขยายที่คลายการบีบอัดแล้ว)**
5. เลือกโฟลเดอร์นี้: `d:\Github\Tradingview\Extension\TV1`

### ขั้นตอนที่ 2: การเปิดใช้งาน
- **สำหรับ Chrome รุ่นใหม่ (Windows 10/11)**:
  - คลิกที่ไอคอนรูปจิ๊กซอว์ 🧩 บนแถบเครื่องมือ -> ปักหมุดไอคอน **TV DZ/SZ Alert**
  - คลิกที่ไอคอนเพื่อเปิดแถบ **Side Panel** ทางขวาของหน้าจอ
- **สำหรับ Windows 7 (Chrome 109)**:
  - คลิกที่ไอคอน Extension เพื่อเปิดหน้าต่าง Popup หรือคลิกปุ่ม **Pop-out** 🪟 เพื่อเปิดเป็นหน้าต่างแยกอิสระได้

### ขั้นตอนที่ 3: ตั้งค่าและเริ่มทำงาน
1. วาง **Discord Webhook URL** ในช่องที่กำหนด
2. เลือก **Timeframe** ที่ต้องการตรวจจับ
3. กดปุ่ม **บันทึก**
4. กดปุ่ม **Test** เพื่อทดสอบว่ามีข้อความส่งเข้า Discord หรือไม่
5. เปิดหน้ากราฟ TradingView ที่ต้องการเฝ้าดู
6. กดปุ่ม **Play** เพื่อให้ระบบเริ่มสแกนและส่งแจ้งเตือนในเบื้องหลังทันที!

---

## 🛠️ โครงสร้างไฟล์ในโปรเจกต์
- `manifest.json` — คอนฟิกูเรชัน Manifest V3 รองรับทั้ง Side Panel และ Chrome 109
- `sidepanel.html` — หน้าต่าง UI ควบคุมโทนสีดำ
- `sidepanel.css` — ดีไซน์สไตล์ Dark Mode & Glassmorphism
- `sidepanel.js` — จัดการการทำงานของ UI, การบันทึกค่า, รับส่งข้อความ
- `content.js` — สแกนหน้ากราฟ TradingView, จับเวลาแท่งปิด, หา DZ/SZ
- `background.js` — Service Worker ส่ง Discord Webhook และแคปภาพหน้าจอ
- `icon.png` — ไอคอนโปรแกรม
