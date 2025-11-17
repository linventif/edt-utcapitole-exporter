import puppeteer, { type Page } from 'puppeteer';
import dotenv from 'dotenv';
import * as path from 'path';
import { validateEnv } from './envSchema';
import { login, selectDatabase } from './login';
import { navigateTreePath } from './pathSelection';
import { extractDateInfo, formatFilename, exportCalendar } from './export';
import { CALENDAR_PATHS, DATABASE_NAME } from './config';

dotenv.config();

const env = validateEnv(process.env);

async function ensureLoggedIn(page: Page): Promise<void> {
	// Check if we're still logged in by looking for the tree structure
	const isLoggedIn = await page.evaluate(() => {
		return document.querySelector('span.x-tree3-node-text') !== null;
	});

	if (!isLoggedIn) {
		console.log('⚠️  Session expired, logging in again...');

		// Check if we're on the login page or error page
		const needsLogin = await page.evaluate(() => {
			return (
				document.querySelector('#userfield') !== null ||
				document.querySelector('button.x-btn-text') !== null
			);
		});

		if (needsLogin) {
			// Click OK on error dialog if present
			const okClicked = await page.evaluate(() => {
				const buttons = Array.from(
					document.querySelectorAll('button.x-btn-text')
				);
				const okButton = buttons.find(
					(btn) => btn.textContent?.trim().toLowerCase() === 'ok'
				);
				if (okButton) {
					(okButton as HTMLElement).click();
					return true;
				}
				return false;
			});

			if (okClicked) {
				console.log('Closed error dialog');
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			// Re-login
			await login(page, env.AUTH_USERNAME, env.AUTH_PASSWORD);
			await selectDatabase(page, DATABASE_NAME);
			console.log('✅ Re-authenticated successfully');
		} else {
			// Just reload to get back to login
			await page.goto(
				'https://ade-production.ut-capitole.fr/direct/myplanning.jsp',
				{
					waitUntil: 'networkidle2',
					timeout: 60000,
				}
			);
			await login(page, env.AUTH_USERNAME, env.AUTH_PASSWORD);
			await selectDatabase(page, DATABASE_NAME);
			console.log('✅ Re-authenticated successfully');
		}
	}
}

async function processCalendar(
	page: Page,
	calendarPath: { name: string; path: string[] }
): Promise<void> {
	console.log(`\n${'='.repeat(60)}`);
	console.log(`Processing calendar: ${calendarPath.name}`);
	console.log(`${'='.repeat(60)}\n`);

	// Navigate to the calendar path
	await navigateTreePath(page, calendarPath.path);

	// Wait for schedule to load
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Extract date information
	const dateInfo = await extractDateInfo(page);
	console.log(`Date range: ${dateInfo.startDate} to ${dateInfo.endDate}`);

	// Format filename and date directory
	const filename = formatFilename(dateInfo, calendarPath.name);
	console.log(`Target filename: ${filename}.ics`);

	// Create ISO date string from the date range (YYYY-MM-DD_to_YYYY-MM-DD)
	let dateDir = 'schedule';
	if (dateInfo.startDate && dateInfo.endDate) {
		const formatDate = (dateStr: string) => {
			const [day, month, year] = dateStr.split('/');
			return `${year}-${month}-${day}`;
		};
		const formattedStartDate = formatDate(dateInfo.startDate);
		const formattedEndDate = formatDate(dateInfo.endDate);
		dateDir = `${formattedStartDate}_to_${formattedEndDate}`;
	}

	// Create export directory: export/DATE_RANGE/CALENDAR_NAME/
	const exportDir = path.join(
		process.cwd(),
		'export',
		dateDir,
		calendarPath.name
	);

	// Export the calendar
	await exportCalendar(page, env.DOWNLOAD_PATH, exportDir, filename);

	console.log(`\n✅ Successfully exported calendar: ${calendarPath.name}\n`);
}

async function main() {
	console.log('Starting browser...');

	const browser = await puppeteer.launch({
		headless: false,
		defaultViewport: null,
		args: ['--start-maximized'],
		executablePath: env.CHROMIUM_PATH,
	});

	try {
		const page = await browser.newPage();

		// Enable console logging from the browser page
		page.on('console', (msg) => {
			const type = msg.type();
			const text = msg.text();
			if (type === 'error') {
				console.log(`[Browser Error] ${text}`);
			} else if (type === 'log') {
				console.log(`[Browser] ${text}`);
			}
		});

		// Login and select database
		await login(page, env.AUTH_USERNAME, env.AUTH_PASSWORD);
		await selectDatabase(page, DATABASE_NAME);

		// Process each calendar path
		for (const calendarPath of CALENDAR_PATHS) {
			try {
				// Ensure we're still logged in before processing
				await ensureLoggedIn(page);

				await processCalendar(page, calendarPath);

				// Navigate back to the tree root if there are more calendars to process
				if (
					CALENDAR_PATHS.indexOf(calendarPath) <
					CALENDAR_PATHS.length - 1
				) {
					console.log('Refreshing page for next calendar...');
					await page.reload({ waitUntil: 'networkidle2' });
					await new Promise((resolve) => setTimeout(resolve, 3000));
				}
			} catch (error) {
				console.error(
					`Failed to process calendar ${calendarPath.name}:`,
					error
				);
				// Continue with next calendar
			}
		}

		console.log('\n' + '='.repeat(60));
		console.log('All calendars processed successfully!');
		console.log('='.repeat(60) + '\n');

		// Keep browser open briefly to see results
		console.log('Keeping browser open for 30 seconds...');
		await new Promise((resolve) => setTimeout(resolve, 30000));
	} catch (error) {
		console.error('An error occurred:', error);
	} finally {
		console.log('Closing browser...');
		await browser.close();
		console.log('Program ended gracefully.');
	}
}

main().catch((error) => {
	console.error('Unhandled error:', error);
	process.exit(1);
});
