# Quick Start Guide

## One-Command Deployment

```bash
./setup.sh
```

## Manual Deployment

### 1. Configure credentials

```bash
cp .env.example .env
nano .env  # Add your ADE_USERNAME and ADE_PASSWORD
```

### 2. Start services

```bash
docker compose up -d
```

### 3. Verify

```bash
# Check logs
docker compose logs -f exporter

# Visit dashboard
open http://localhost:6845
```

## Production Deployment (with Cloudflare Tunnel)

### On your server:

```bash
# 1. Clone and setup
git clone <your-repo>
cd edt-utcapitole-exporter
./setup.sh

# 2. Verify services are running
docker compose ps

# 3. Start Cloudflare Tunnel (on host, not in Docker)
cloudflared tunnel --url http://localhost:6845
```

Your calendar service will be available at: **https://ade.linv.dev**

## Calendar URLs

Each calendar is accessible at:

```
https://ade.linv.dev/calendars/CALENDAR_NAME/CALENDAR_NAME.ics
```

Examples:

-   `https://ade.linv.dev/calendars/IMMFA1TD01/IMMFA1TD01.ics`
-   `https://ade.linv.dev/calendars/IMMFA1CM01/IMMFA1CM01.ics`

## Adding New Calendars

Edit `src/config.ts`:

```typescript
export const CALENDAR_PATHS: CalendarPath[] = [
	{
		name: 'IMMFA1TD01',
		path: [
			'Trainees',
			'UFR Informatique',
			'M1 MIAGE',
			'IMMFA1TD',
			'IMMFA1TD01',
		],
	},
	{
		name: 'YOUR_NEW_CALENDAR',
		path: ['Your', 'Path', 'To', 'Calendar'],
	},
];
```

Then restart:

```bash
docker compose restart exporter
```

## Useful Commands

```bash
# View all logs
docker compose logs -f

# View only exporter logs
docker compose logs -f exporter

# Force manual export now
docker compose exec exporter bun run src/index.ts

# Restart services
docker compose restart

# Stop everything
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

## Troubleshooting

### Calendars not exporting

```bash
docker compose logs exporter
```

### Wrong credentials

```bash
nano .env  # Fix credentials
docker compose restart exporter
```

### Port 6845 already in use

Edit `docker-compose.yml`:

```yaml
ports:
    - '8080:80' # Use port 8080 instead
```

## File Structure

```
.
├── Dockerfile              # Exporter container
├── docker-compose.yml      # Service orchestration
├── setup.sh               # One-command setup
├── .env                   # Your credentials (not in git)
├── nginx/
│   ├── nginx.conf         # Web server config
│   └── index.html         # Dashboard
├── src/                   # Application code
└── export/                # Generated ICS files (shared volume)
```

## Updates

To update the service:

```bash
git pull
docker compose up -d --build
```

## Monitoring

Dashboard shows:

-   ✅ Available calendars
-   📡 Service status
-   🔗 Direct calendar URLs

Visit: **https://ade.linv.dev** or **http://localhost:6845**
