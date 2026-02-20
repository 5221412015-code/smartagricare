# AGENTS.md

This file provides guidance to AI assistants when working with code in this repository.

## Project Overview

SmartAgriCare (SAC) is an AI-powered agriculture web app designed to help farmers with:
- **Disease Detection**: CNN-based plant disease identification from leaf images
- **Crop Recommendation**: Season-based crop suggestions (Kharif, Rabi, Zaid)
- **Voice Assistant**: Multilingual farming advice (English, Hindi, Telugu)
- **Local Stores**: Find nearby agricultural stores via OpenStreetMap integration

## Architecture

```
smartagricare/
├── backend/           # Express.js REST API (port 5000)
├── frontend/          # Vite + React + TypeScript web app (port 8080)
│   └── src/
│       ├── components/   # BottomNav, MobileLayout, shadcn/ui
│       ├── contexts/     # AuthContext, AppContext (auth & language state)
│       ├── pages/        # All app pages (11 pages)
│       ├── services/     # API service layer (api.ts)
│       └── test/         # Vitest test suite
├── expo-app/          # Expo WebView wrapper (loads frontend URL on device)
├── ml-service/        # Flask ML API (port 5001) with .pkl model placeholder
└── .gitignore
```

## Build & Run Commands

### Backend (Node.js)
```powershell
cd backend
npm install
npm start              # Production (port 5000)
npm run dev            # Development with hot-reload
npm test               # Run tests
```

### ML Service (Python)
```powershell
cd ml-service
pip install -r requirements.txt
python app.py          # Development (port 5001)
```
**Model Integration**: Place your trained `.pkl` model in `ml-service/models/disease_model.pkl`

### Web Frontend (Vite)
```powershell
cd frontend
npm install
npm run dev            # Development (port 8080)
npm run build          # Production build
npm test               # Run tests
```

### Expo Wrapper (optional)
```powershell
cd expo-app
npm install
npx expo start           # Start dev server
npx expo start --android # Android emulator
npx expo start --ios     # iOS simulator
```

## API Endpoints

### Backend (port 5000)
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/diseases` - List all diseases
- `GET /api/diseases/:name` - Get disease info
- `POST /api/crops/recommend` - Get crop recommendations by season
- `GET /api/stores/nearby` - Get nearby stores
- `GET /api/stores/search` - Search stores by query
- `POST /api/voice/query` - Process voice query
- `GET /api/weather` - Get weather data

### ML Service (port 5001)
- `POST /predict` - Predict disease from image (multipart/form-data)
- `GET /diseases` - List supported diseases
- `GET /health` - Health check

## Key Files to Know

### Web Frontend
- `src/services/api.ts` - API service layer connecting to backend + ML service
- `src/contexts/AuthContext.tsx` - Auth state (login, register, logout)
- `src/contexts/AppContext.tsx` - App-wide state (language)
- `src/pages/` - All 11 pages (Dashboard, Auth, DiseaseDetection, CropRecommendation, etc.)

### Backend
- `index.js` - All routes, middleware, mock data, error handlers
- `.env` - PORT, JWT_SECRET, CORS_ORIGINS, ML_SERVICE_URL

### ML Service
- `models/disease_model.pkl` - Place trained model here
- `models/class_labels.json` - Disease class labels

## Multilingual Support

Languages: English (en), Hindi (hi), Telugu (te)
- Voice responses in backend and VoiceAssistant page
- Crop names in CropRecommendation page

## Testing

- **Frontend**: Vitest + React Testing Library (`npm test` in frontend/)
- **Backend**: Node built-in test runner (`npm test` in backend/)
- **ML Service**: No tests configured (use pytest)
