import { serve } from 'bun';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { CALENDAR_MERGES } from './src/config';

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
		// Get all date directories
		const dateDirs = await readdir(exportDir);

		// Sort by date (newest first)
		dateDirs.sort((a, b) => b.localeCompare(a));

		// Look for the calendar in the most recent date directory
		for (const dateDir of dateDirs) {
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

		// Health check
		if (url.pathname === '/') {
			return new Response('Calendar Server Running', {
				headers: { 'Content-Type': 'text/plain' },
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
						'Content-Disposition': `attachment; filename="${calendarName}.ics"`,
						'Cache-Control': 'no-cache, no-store, must-revalidate',
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
						'Content-Disposition': `attachment; filename="${calendarName}.ics"`,
						'Cache-Control': 'no-cache, no-store, must-revalidate',
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
console.log('\nAvailable calendars:');
console.log('  - http://localhost:6845/calendar/M1_MIAGE');
console.log('  - http://localhost:6845/calendar/IMMFA1TD01');

// List merged calendars
if (Object.keys(CALENDAR_MERGES).length > 0) {
	console.log('\nMerged calendars:');
	for (const [name, sources] of Object.entries(CALENDAR_MERGES)) {
		console.log(
			`  - http://localhost:6845/calendar/${name} (merges: ${sources.join(
				', '
			)})`
		);
	}
}

console.log('\nUse these URLs to subscribe in Google/Proton Calendar');
