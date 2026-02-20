# 🌱 SmartAgriCare

**AI-powered agriculture app** — helping farmers with disease detection, crop recommendations, multilingual voice assistance, and nearby store discovery. Includes a **web frontend** and an **Expo WebView wrapper** for mobile.

## Features

| Feature | Description |
|---|---|
| 🔬 **Disease Detection** | CNN-based plant disease identification from leaf images via ML service |
| 🌾 **Crop Recommendation** | Season-based crop suggestions (Kharif, Rabi, Zaid) with sowing/harvest details |
| 🎙️ **Voice Assistant** | Multilingual farming advice with text-to-speech (English, Hindi, Telugu) |
| 🏪 **Local Stores** | Find nearby agricultural stores with OpenStreetMap integration |
| 🌤️ **Weather** | Real-time weather data on the home dashboard |
| 🌐 **Multilingual** | Full UI in English, Hindi (हिंदी), Telugu (తెలుగు) |

## Architecture

```
smartagricare/
├── backend/           # Express.js REST API (port 5000)
├── frontend/          # Vite + React + TypeScript web app (port 8080)
│   └── src/
│       ├── components/   # BottomNav, MobileLayout, shadcn/ui
│       ├── contexts/     # AuthContext, AppContext
│       ├── pages/        # All app pages
│       ├── services/     # API service layer (api.ts)
│       └── test/         # Vitest test suite
├── expo-app/          # Expo WebView wrapper (loads frontend URL)
├── ml-service/        # Flask ML API (port 5001)
└── .gitignore
```

## Quick Start

### 1. Backend (Node.js)

```bash
cd backend
npm install
npm start            # Production (port 5000)
npm run dev          # Development with hot-reload
```

### 2. ML Service (Python)

```bash
cd ml-service
pip install -r requirements.txt
python app.py        # Development (port 5001)
```

> **Note:** Place your trained `.pkl` model in `ml-service/models/disease_model.pkl`. Without it, the service returns mock predictions.

### 3. Web Frontend (Vite)

```bash
cd frontend
npm install
npm run dev          # Development (port 8080)
npm run build        # Production build
npm test             # Run tests
```

### 4. Expo Wrapper (optional — for mobile)

The `expo-app/` is a lightweight WebView shell that loads the web frontend inside a native container.

```bash
cd expo-app
npm install
npx expo start             # Start dev server
npx expo start --android   # Android emulator
npx expo start --ios       # iOS simulator
```

> **Note:** Update the `DEV_URL` in `expo-app/App.js` to match your machine's local IP address so the phone can reach the Vite dev server.

## API Endpoints

### Backend (port 5000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| GET | `/api/diseases` | List all diseases |
| GET | `/api/diseases/:name` | Get disease info |
| POST | `/api/crops/recommend` | Crop recommendations by season |
| GET | `/api/stores/nearby` | Nearby stores |
| GET | `/api/stores/search` | Search stores by name/address |
| POST | `/api/voice/query` | Process voice query |
| GET | `/api/weather` | Weather data |

### ML Service (port 5001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/predict` | Predict disease from image (multipart/form-data) |
| GET | `/diseases` | List supported diseases |
| GET | `/health` | Health check |

## Environment & Configuration

- **Backend `.env`** configures `PORT`, `JWT_SECRET`, `CORS_ORIGINS`, and `ML_SERVICE_URL`
- **Frontend** uses `VITE_API_URL` and `VITE_ML_URL` env vars (defaults to `localhost:5000` / `localhost:5001`)
- **Expo wrapper** — update `DEV_URL` in `App.js` with your machine's local IP

## Tech Stack

- **Web Frontend:** Vite 5, React 18, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion
- **Expo Wrapper:** React Native + Expo (WebView)
- **Backend:** Express.js 5, dotenv
- **ML Service:** Flask + PIL + NumPy
- **Testing:** Vitest (frontend), Node test runner (backend)
- **Navigation:** React Router (web)
- **State:** React Context + localStorage

## License

ISC
