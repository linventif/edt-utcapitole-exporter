# ADE UT Capitole Calendar Exporter

Automatic calendar export service for UT Capitole ADE schedules with Docker deployment.

## Features

-   🔄 Automatic calendar export every 6 hours
-   🐳 Docker-based deployment (one-command setup)
-   🌐 Nginx web server for calendar distribution
-   📱 Beautiful dashboard to view and subscribe to calendars
-   🔗 Direct ICS URLs for Google/Proton Calendar subscription
-   ☁️ Cloudflare Tunnel ready

## Quick Start

### Prerequisites

-   Docker & Docker Compose installed
-   Cloudflare Tunnel (optional, for public access)
-   `.env` file with credentials

### Setup

1. **Clone the repository**

    ```bash
    git clone <your-repo>
    cd edt-utcapitole-exporter
    ```

2. **Create `.env` file**

    ```bash
    cp .env.example .env
    # Edit .env with your credentials
    ```

3. **Start the service**

    ```bash
    docker compose up -d
    ```

4. **Access the dashboard**
    - Local: http://localhost:6845
    - Public (with Cloudflare): https://ade.linv.dev

## Architecture

```
┌─────────────────┐
│   Exporter      │  ← Runs every 6 hours
│   (Puppeteer)   │     Exports ICS files
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   export/       │  ← Shared volume
│   ├─ CALENDAR1/ │
│   └─ CALENDAR2/ │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Nginx         │  ← Serves ICS + Dashboard
│   :6845         │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Cloudflare     │  ← Public access
│  Tunnel         │     https://ade.linv.dev
└─────────────────┘
```

## Configuration

### Add Calendars

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
	// Add more calendars here
];
```

### Change Export Interval

Edit `docker-compose.yml`:

```yaml
# Current: every 6 hours (21600 seconds)
command: sh -c "while true; do bun run src/index.ts && sleep 21600; done"
```

## Calendar URLs

After deployment, calendars are available at:

-   `https://ade.linv.dev/calendars/CALENDAR_NAME/CALENDAR_NAME.ics`

Example:

-   `https://ade.linv.dev/calendars/IMMFA1TD01/IMMFA1TD01.ics`
-   `https://ade.linv.dev/calendars/IMMFA1CM01/IMMFA1CM01.ics`

## Subscribe in Calendar Apps

### Proton Calendar

1. Settings → Calendars
2. Add calendar → From URL
3. Paste the calendar URL

### Google Calendar

1. Settings → Add calendar → From URL
2. Paste the calendar URL

## Development

### Local Development

```bash
# Install dependencies
bun install

# Run exporter once
bun run src/index.ts

# Run with auto-reload
bun run dev
```

### Manual Export

```bash
docker compose run --rm exporter bun run src/index.ts
```

### View Logs

```bash
docker compose logs -f exporter
docker compose logs -f nginx
```

## Production Deployment

1. **Start services**

    ```bash
    docker compose up -d
    ```

2. **Setup Cloudflare Tunnel** (on host)

    ```bash
    cloudflared tunnel --url http://localhost:6845
    ```

3. **Verify**
    - Visit https://ade.linv.dev
    - Check calendar URLs are working

## Troubleshooting

### Calendars not updating

```bash
docker compose logs exporter
docker compose restart exporter
```

### Nginx not serving files

```bash
docker compose logs nginx
ls -la export/
```

### Force manual export

```bash
docker compose exec exporter bun run src/index.ts
```

## License

MIT
