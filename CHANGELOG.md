# Changelog

Semua changes penting dalam project ini akan didokumentasikan di file ini.

Format berdasarkan [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
dan project ini menggunakan [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-03-10

### ✨ Added
- Initial dashboard UI/Design layout
- Responsive design untuk desktop & tablet devices
- Login page dengan form validation
- Protected dashboard dengan authentication system
- Orders management view dengan data table
- Real-time metrics display (Orders, Sales, Inventory, Finance)
- JWT-based authentication system
- Database schema dengan 6 tables (users, products, orders, order_items, transactions, employees)
- Backend API endpoints:
  - `POST /api/auth/login` - User authentication
  - `POST /api/auth/logout` - User logout
  - `GET /api/orders` - Fetch orders list
  - `GET /api/health` - Server health check
- WebSocket (Socket.io) infrastructure untuk real-time updates
- Error handling middleware
- CORS configuration
- Graceful shutdown handling
- Database indexing untuk performance

### 🔧 Technical Setup
- **Backend**: Node.js 18+ dengan Express 5.2.1
- **Frontend**: React 19.2.4 dengan React Router v7
- **Database**: PostgreSQL 15
- **Real-time**: Socket.io 4.8.3
- **Authentication**: JWT (jsonwebtoken 9.0.3)
- **State Management**: React Context API
- **HTTP Client**: Axios 1.13.6
- **UI Components**: Recharts untuk charts, Lucide React untuk icons

### 📊 Database Schema
Tabel yang dibuat:
- `users` - User accounts & authentication
- `products` - Inventory management
- `orders` - Sales orders tracking
- `order_items` - Order line items dengan relationship ke orders & products
- `transactions` - Financial records
- `employees` - Employee management

Dengan:
- Primary keys di semua tabel
- Foreign key constraints untuk data integrity
- Indexes untuk performance optimization
- Timestamps (created_at, updated_at) untuk audit trail

### 🔐 Demo Credentials
- **Username**: `admin`
- **Password**: `admin123`

### ⚠️ Known Limitations (MVP)
- Password hashing tidak diimplementasikan (demo auth only)
- Limited error handling (akan ditingkatkan di v0.2)
- Advanced charts tidak ada yet
- Mobile responsive design belum optimal
- Email notifications tidak ada
- User management UI belum dibuat
- Export functionality (PDF/Excel) belum ada
- Input validation minimal
- No logging system yet

### ✅ Testing Status
- [x] Backend API fully tested
- [x] Login/Authentication working
- [x] Dashboard displays correctly
- [x] Database connection stable
- [x] Protected routes functional
- [x] Order data retrieved & displayed
- [x] WebSocket connection established
- [x] Error handling basic level

### 📦 Installation & Setup

**Backend:**
```bash
cd backend
npm install
# Jalankan development mode:
npm run dev
# Atau production mode:
npm start
```

**Frontend:**
```bash
cd frontend
npm install
npm start
# Akan membuka http://localhost:3000
```

**Database:**
```bash
psql -U postgres
CREATE DATABASE dashboard_db;
\c dashboard_db
\i backend/schema.sql
```

### 🔒 Security Notes
- JWT_SECRET harus diganti dengan strong value untuk production
- Implement password hashing (bcrypt) sebelum production
- Setup HTTPS/SSL certificates
- Configure CORS untuk production domain
- Add rate limiting middleware
- Implement request validation & sanitization
- Setup comprehensive logging

### 🎯 What's Next (V0.2)
- [ ] Implement proper password hashing (bcrypt)
- [ ] Add API endpoints untuk products, employees, transactions
- [ ] Implement advanced dashboard charts
- [ ] User management interface
- [ ] Export to PDF/Excel functionality
- [ ] Email notification system
- [ ] Mobile-responsive improvements
- [ ] Dark mode theme
- [ ] Input validation middleware
- [ ] Comprehensive logging system
- [ ] Rate limiting

---

## Release Information

**Version**: 0.1.0  
**Release Date**: March 10, 2026  
**Status**: Stable (MVP Complete) ✅  
**Maintainer**: Harun Arasy

Untuk deployment ke production, silakan baca FINAL_SUMMARY.md dan CREDENTIALS.md untuk setup instructions lengkap.

