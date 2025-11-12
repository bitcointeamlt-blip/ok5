# Colyseus Server for DOT Clicker PvP

## Setup

1. Install dependencies:
```bash
cd colyseus-server
npm install
```

2. Set environment variables (optional):
```bash
PORT=2567  # Default port
```

## Development

Run in development mode:
```bash
npm run dev
```

## Build

Build for production:
```bash
npm run build
```

## Deploy to Colyseus Cloud

1. Push code to GitHub repository
2. In Colyseus Cloud dashboard, click "LINK WITH GITHUB"
3. Select your repository
4. Set build settings:
   - Build command: `cd colyseus-server && npm install && npm run build`
   - Start command: `cd colyseus-server && npm start`
   - Root directory: `colyseus-server`

## Environment Variables

Set these in Colyseus Cloud dashboard:
- `PORT` - Server port (default: 2567)

## Testing Locally

1. Start server: `npm run dev`
2. Server will run on `ws://localhost:2567`
3. Update frontend `.env` file:
   ```
   VITE_COLYSEUS_ENDPOINT=ws://localhost:2567
   ```

