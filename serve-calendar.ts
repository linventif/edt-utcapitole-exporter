import { serve } from 'bun';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { CALENDAR_MERGES, CALENDAR_PATHS } from './src/config';

// Parse ICS file and extract events
function parseICS(icsContent: string): string[] {
	const events: string[] = [];
	const lines = icsContent.split('\n');
	let currentEvent: string[] = [];
	let inEvent = false;

	for (const line of lines) {
		if (line.trim() === 'BEGIN:VEVENT') {
			inEvent = true;
			currentEvent = [line];
		} else if (line.trim() === 'END:VEVENT') {
			currentEvent.push(line);
			events.push(currentEvent.join('\n'));
			currentEvent = [];
			inEvent = false;
		} else if (inEvent) {
			currentEvent.push(line);
		}
	}

	return events;
}

// Merge multiple ICS files into one
function mergeICS(icsFiles: string[], mergedName: string): string {
	const allEvents: string[] = [];
	let header = '';
	let footer = '';

	// Extract events from all ICS files
	for (const icsContent of icsFiles) {
		const events = parseICS(icsContent);
		allEvents.push(...events);

		// Use the first file's header and footer
		if (!header) {
			const headerMatch = icsContent.match(/^([\s\S]*?)BEGIN:VEVENT/m);
			const footerMatch = icsContent.match(/END:VEVENT([\s\S]*?)$/m);
			if (headerMatch && headerMatch[1]) header = headerMatch[1];
			if (footerMatch && footerMatch[1]) footer = footerMatch[1];
		}
	}

	// Remove duplicate events (same UID)
	const uniqueEvents = new Map<string, string>();
	for (const event of allEvents) {
		const uidMatch = event.match(/UID:(.+)/);
		if (uidMatch && uidMatch[1]) {
			const uid = uidMatch[1].trim();
			if (!uniqueEvents.has(uid)) {
				uniqueEvents.set(uid, event);
			}
		} else {
			// If no UID, include the event with random key
			uniqueEvents.set(Math.random().toString(), event);
		}
	}

	// Update calendar name in header
	const updatedHeader = header.replace(
		/(X-WR-CALNAME:).*/,
		`$1${mergedName}`
	);

	// Combine everything
	return (
		updatedHeader +
		Array.from(uniqueEvents.values()).join('\n') +
		'\n' +
		footer
	);
}

// Get the most recent ICS file for a given calendar name
async function getLatestICS(calendarName: string): Promise<string | null> {
	const exportDir = join(process.cwd(), 'export');

	try {
		// Strategy 1: Try direct calendar folder (export/CALENDAR_NAME/)
		const directCalendarDir = join(exportDir, calendarName);
		try {
			const files = await readdir(directCalendarDir);
			const icsFile = files.find((f) => f.endsWith('.ics'));
			if (icsFile) {
				return await readFile(
					join(directCalendarDir, icsFile),
					'utf-8'
				);
			}
		} catch {
			// Directory doesn't exist, try strategy 2
		}

		// Strategy 2: Look in date directories (export/DATE/CALENDAR_NAME/)
		const dateDirs = await readdir(exportDir);

		// Filter out non-directory entries and sort by date (newest first)
		const dateDirectories = [];
		for (const dir of dateDirs) {
			const fullPath = join(exportDir, dir);
			try {
				const stat = await Bun.file(fullPath).exists();
				// Check if it looks like a date directory (contains hyphens)
				if (dir.includes('-')) {
					dateDirectories.push(dir);
				}
			} catch {
				continue;
			}
		}

		dateDirectories.sort((a, b) => b.localeCompare(a));

		// Look for the calendar in date directories
		for (const dateDir of dateDirectories) {
			const calendarDir = join(exportDir, dateDir, calendarName);
			try {
				const files = await readdir(calendarDir);
				const icsFile = files.find((f) => f.endsWith('.ics'));
				if (icsFile) {
					return await readFile(join(calendarDir, icsFile), 'utf-8');
				}
			} catch {
				continue;
			}
		}
	} catch (error) {
		console.error('Error reading export directory:', error);
	}

	return null;
}

const server = serve({
	port: 6845,
	async fetch(req) {
		const url = new URL(req.url);

		// Root endpoint - show available calendars
		if (url.pathname === '/') {
			const calendars = CALENDAR_PATHS.map((cp) => cp.name);
			const merged = Object.keys(CALENDAR_MERGES);

			const html = `
<!DOCTYPE html>
<html>
<head>
	<title>Calendar Server</title>
	<style>
		body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 20px; }
		h1 { color: #333; }
		.calendar-list { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
		.calendar-item { margin: 10px 0; }
		code { background: #e0e0e0; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; }
		.info { background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0; }
	</style>
</head>
<body>
	<h1>🗓️ Calendar Server</h1>

	<div class="info">
		<strong>Public URL:</strong> https://ics-cal-test-gpimp-2025-2026.linv.dev
	</div>

	<h2>📋 Available Calendars</h2>
	<div class="calendar-list">
		${calendars
			.map(
				(name) => `
			<div class="calendar-item">
				📅 <strong>${name}</strong><br>
				<code>https://ics-cal-test-gpimp-2025-2026.linv.dev/calendar/${name}</code>
			</div>
		`
			)
			.join('')}
	</div>

	${
		merged.length > 0
			? `
		<h2>🔗 Merged Calendars</h2>
		<div class="calendar-list">
			${merged
				.map((name) => {
					const sources = CALENDAR_MERGES[name];
					return `
				<div class="calendar-item">
					🔀 <strong>${name}</strong> (merges: ${sources?.join(', ')})<br>
					<code>https://ics-cal-test-gpimp-2025-2026.linv.dev/calendar/${name}</code>
				</div>
			`;
				})
				.join('')}
		</div>
	`
			: ''
	}

	<div class="info">
		<strong>How to use:</strong> Copy the URL above and paste it into Proton Calendar or Google Calendar's "Add calendar by URL" feature.
	</div>
</body>
</html>
			`;

			return new Response(html, {
				headers: { 'Content-Type': 'text/html; charset=utf-8' },
			});
		}

		// Serve ICS file: /calendar/M1_MIAGE or /calendar/IMMFA1TD01
		if (url.pathname.startsWith('/calendar/')) {
			const calendarName = url.pathname.split('/calendar/')[1];

			if (!calendarName) {
				return new Response('Calendar name required', { status: 400 });
			}

			// Check if this is a merged calendar
			if (CALENDAR_MERGES[calendarName]) {
				const sourceCalendars = CALENDAR_MERGES[calendarName];
				const icsContents: string[] = [];

				// Fetch all source calendars
				for (const sourceName of sourceCalendars) {
					const content = await getLatestICS(sourceName);
					if (content) {
						icsContents.push(content);
					}
				}

				if (icsContents.length === 0) {
					return new Response(
						`No calendars found for merged calendar "${calendarName}"`,
						{ status: 404 }
					);
				}

				// Merge the ICS files
				const mergedICS = mergeICS(icsContents, calendarName);

				return new Response(mergedICS, {
					headers: {
						'Content-Type': 'text/calendar; charset=utf-8',
						'Cache-Control': 'no-cache, no-store, must-revalidate',
						Pragma: 'no-cache',
						Expires: '0',
						'Access-Control-Allow-Origin': '*',
					},
				});
			}

			// Serve single calendar
			const icsContent = await getLatestICS(calendarName);

			if (icsContent) {
				return new Response(icsContent, {
					headers: {
						'Content-Type': 'text/calendar; charset=utf-8',
						'Cache-Control': 'no-cache, no-store, must-revalidate',
						Pragma: 'no-cache',
						Expires: '0',
						'Access-Control-Allow-Origin': '*',
					},
				});
			} else {
				return new Response('Calendar not found', { status: 404 });
			}
		}

		return new Response('Not Found', { status: 404 });
	},
});

console.log(`🗓️  Calendar server running at http://localhost:${server.port}`);
console.log('\n🌐 Public URL: https://ics-cal-test-gpimp-2025-2026.linv.dev');
console.log('\n📋 Available calendars:');
for (const calendar of CALENDAR_PATHS) {
	console.log(
		`  - https://ics-cal-test-gpimp-2025-2026.linv.dev/calendar/${calendar.name}`
	);
}

// List merged calendars
if (Object.keys(CALENDAR_MERGES).length > 0) {
	console.log('\n🔗 Merged calendars:');
	for (const [name, sources] of Object.entries(CALENDAR_MERGES)) {
		console.log(
			`  - https://ics-cal-test-gpimp-2025-2026.linv.dev/calendar/${name} (merges: ${sources.join(
				', '
			)})`
		);
	}
}

console.log(
	'\n💡 Tip: Visit https://ics-cal-test-gpimp-2025-2026.linv.dev in your browser to see all available calendars.'
);
