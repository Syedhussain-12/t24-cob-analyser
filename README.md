<<<<<<< HEAD
# T24 COB Performance Analyser
### by Vexora AI

AI-powered Temenos T24 Close of Business log analyser with dashboard, issue detection, optimization recommendations, and expert chat.

---

## Tech Stack
- React 18
- Claude AI (claude-haiku-4-5) via Vercel serverless proxy
- Pure SVG charts (no chart library dependency)

## Project Structure
```
t24-cob/
├── src/
│   ├── App.js          # Main React app
│   └── index.js        # Entry point
├── api/
│   └── analyze.js      # Vercel serverless proxy (keeps API key safe)
├── public/
│   └── index.html
├── vercel.json         # Vercel config
└── package.json
```

## Local Development
```bash
npm install
npm start
# App runs at http://localhost:3000
# Note: API calls won't work locally without a .env file
```

For local dev, create a `.env` file:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```
Then run with `vercel dev` instead of `npm start`.

## Deployment (Vercel)
See DEPLOYMENT.md for full step-by-step instructions.
=======
# t24-cob-analyser
>>>>>>> 2cb08179a20b7e794231e868c2615fdbe6281d26
