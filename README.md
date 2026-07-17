# Next-Gen Help Desk Portal

A modern, secure, and AI-powered help desk system built with the MERN stack.

## Features

### 🔐 Security
- JWT Authentication
- Multi-Factor Authentication (MFA/TOTP)
- Role-based Access Control (Admin, Agent, Customer)
- Audit Logging for all state-changing operations
- Rate limiting and CORS protection

### 🤖 AI Integration
- Auto-draft responses using OpenAI GPT
- Sentiment analysis for customer messages
- Professional tone suggestions

### 📊 Real-time Features
- Live ticket updates via Socket.io
- Real-time dashboard analytics
- Typing indicators
- Instant notifications for new tickets

### 📈 Analytics
- SLA breach tracking
- Agent performance metrics
- Average resolution time
- Ticket distribution by status and priority
- Visual charts with Recharts

### 🎫 Ticket Management
- Priority-based SLA deadlines
- Status tracking (Open, In Progress, Resolved, Closed)
- Conversation history
- Assignment system

## Tech Stack

### Backend
- Node.js + Express.js
- MongoDB + Mongoose
- Socket.io
- OpenAI API
- otplib (MFA)
- JWT + bcryptjs

### Frontend
- React 18 + Vite
- Tailwind CSS
- Recharts
- Socket.io-client
- React Router v6
- Lucide Icons

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 6+
- OpenAI API Key

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Environment Variables

### Backend (.env)
```
MONGODB_URI=mongodb://localhost:27017/helpdesk_portal
JWT_SECRET=your_super_secure_jwt_secret_key_change_in_production
JWT_EXPIRE=7d
PORT=5000
OPENAI_API_KEY=your_openai_api_key_here
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000/api
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/verify-mfa` - Verify MFA code
- `GET /api/auth/mfa/setup` - Setup MFA
- `POST /api/auth/mfa/enable` - Enable MFA
- `POST /api/auth/mfa/disable` - Disable MFA
- `GET /api/auth/me` - Get current user

### Tickets
- `GET /api/tickets` - List tickets (filtered by role)
- `GET /api/tickets/:id` - Get single ticket
- `POST /api/tickets` - Create ticket
- `PUT /api/tickets/:id` - Update ticket
- `DELETE /api/tickets/:id` - Delete ticket (Admin only)

### AI
- `POST /api/ai/draft` - Generate AI response draft
- `POST /api/ai/sentiment` - Analyze message sentiment

### Analytics
- `GET /api/analytics/dashboard` - Dashboard analytics
- `GET /api/analytics/sla-report` - SLA breach report

## Socket.IO Events

### Client → Server
- `join_ticket` - Join ticket room
- `leave_ticket` - Leave ticket room
- `typing` - Send typing indicator
- `stop_typing` - Stop typing indicator

### Server → Client
- `new_ticket` - New ticket created
- `ticket_updated` - Ticket updated
- `ticket_deleted` - Ticket deleted
- `user_typing` - User is typing
- `user_stop_typing` - User stopped typing

## Project Structure

```
workspace/
├── backend/
│   ├── models/          # Mongoose schemas
│   ├── routes/          # API routes
│   ├── middleware/      # Auth & audit middleware
│   └── server.js        # Main server file
└── frontend/
    ├── src/
    │   ├── components/  # Reusable components
    │   ├── context/     # React context (Auth)
    │   ├── pages/       # Page components
    │   ├── utils/       # Utilities (API client)
    │   └── App.jsx      # Main app component
    └── package.json
```

## Usage Examples

### Creating a Ticket
1. Login as a customer
2. Navigate to dashboard
3. Click "New Ticket" (implement in future)
4. Fill title, description, and priority
5. Submit

### Using AI Draft
1. Open a ticket detail view
2. Click "AI Draft" button
3. Review generated response
4. Edit if needed
5. Send

### Enabling MFA
1. Go to account settings (implement in future)
2. Click "Enable MFA"
3. Scan QR code with authenticator app
4. Enter verification code
5. MFA enabled

## License

MIT
