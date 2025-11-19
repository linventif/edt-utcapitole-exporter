import puppeteer, { type Page } from 'puppeteer';
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { validateEnv } from './envSchema';
import { login, selectDatabase } from './login';
import { navigateTreePath } from './pathSelection';
import { extractDateInfo, formatFilename, exportCalendar } from './export';
import { CALENDAR_PATHS, DATABASE_NAME } from './config';

dotenv.config();

const env = validateEnv(process.env);

async function ensureLoggedIn(page: Page): Promise<void> {
	console.log('Checking authentication status...');

	// Check if we're still logged in by looking for the tree structure
	const isLoggedIn = await page.evaluate(() => {
		return document.querySelector('span.x-tree3-node-text') !== null;
	});

	if (!isLoggedIn) {
		console.log('⚠️  Session expired, logging in again...');

		try {
			// Navigate directly to myplanning.jsp - if session is valid, it will show the tree
			// If session expired, it will redirect to login
			console.log('Attempting to access planning page...');
			await page.goto(
				'https://ade-production.ut-capitole.fr/direct/myplanning.jsp',
				{
					waitUntil: 'networkidle2',
					timeout: 60000,
				}
			);

			await new Promise((resolve) => setTimeout(resolve, 3000));

			// Check if we got to the planning page or need to login
			const hasTree = await page.evaluate(() => {
				return (
					document.querySelector('span.x-tree3-node-text') !== null
				);
			});

			if (hasTree) {
				console.log('✅ Session still valid, back to planning page');
				return;
			}

			// We need to login - check if login form is present or we need to navigate
			const hasLoginForm = await page.evaluate(() => {
				return document.querySelector('#userfield') !== null;
			});

			if (!hasLoginForm) {
				console.log('No login form, navigating to login page...');
				await page.goto(
					'https://ade-production.ut-capitole.fr/direct/index.jsp',
					{
						waitUntil: 'networkidle2',
						timeout: 60000,
					}
				);
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			// Dismiss any error dialogs
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
				console.log('Dismissed error dialog');
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			// Fill in login credentials
			console.log('Filling in login credentials...');
			await page.waitForSelector('#userfield', {
				visible: true,
				timeout: 10000,
			});

			// Clear any existing input first
			await page.evaluate(() => {
				const userField = document.querySelector(
					'#userfield'
				) as HTMLInputElement;
				const passField = document.querySelector(
					'#passwordfield'
				) as HTMLInputElement;
				if (userField) userField.value = '';
				if (passField) passField.value = '';
			});

			await page.type('#userfield', env.AUTH_USERNAME);

			await page.waitForSelector('#passwordfield', { visible: true });
			await page.type('#passwordfield', env.AUTH_PASSWORD);

			await page.waitForSelector('button.btn.btn-success', {
				visible: true,
			});
			await page.click('button.btn.btn-success');

			console.log('Login submitted.');

			// Select database
			await selectDatabase(page, DATABASE_NAME);

			// Wait for tree to be ready
			await page.waitForSelector('span.x-tree3-node-text', {
				visible: true,
				timeout: 30000,
			});

			console.log('✅ Re-authenticated successfully');
		} catch (error) {
			console.error('❌ Re-authentication failed:', error);
			throw new Error(
				'Failed to re-authenticate: ' +
					(error instanceof Error ? error.message : String(error))
			);
		}
	} else {
		console.log('✓ Already logged in');
	}
}

async function resetTreeView(page: Page): Promise<boolean> {
	console.log('Resetting tree view...');

	try {
		// Use ensureLoggedIn which will navigate to myplanning and handle session
		// This is more robust than directly navigating
		// First, give a moment after export
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Force a check that will trigger navigation
		const hasTree = await page
			.evaluate(() => {
				return (
					document.querySelector('span.x-tree3-node-text') !== null
				);
			})
			.catch(() => false);

		if (!hasTree) {
			// Navigate to myplanning.jsp
			console.log('Tree not found, navigating to planning page...');
			await page.goto(
				'https://ade-production.ut-capitole.fr/direct/myplanning.jsp',
				{
					waitUntil: 'networkidle2',
					timeout: 60000,
				}
			);

			await new Promise((resolve) => setTimeout(resolve, 3000));
		}

		// Wait for tree to be ready
		await page.waitForSelector('span.x-tree3-node-text', {
			visible: true,
			timeout: 30000,
		});

		console.log('✓ Tree view reset successfully');

		// Give it a moment to stabilize
		await new Promise((resolve) => setTimeout(resolve, 2000));
		return true;
	} catch (error) {
		console.error('Failed to reset tree view:', error);
		return false; // Return false instead of throwing
	}
}

async function cleanSessionAndRelogin(page: Page): Promise<void> {
	console.log('🧹 Cleaning session and logging in fresh...');

	try {
		// Clear all cookies
		const client = await page.target().createCDPSession();
		await client.send('Network.clearBrowserCookies');
		await client.send('Network.clearBrowserCache');
		console.log('✓ Cookies and cache cleared');

		// Navigate to fresh login page
		await page.goto(
			'https://ade-production.ut-capitole.fr/direct/index.jsp',
			{
				waitUntil: 'networkidle2',
				timeout: 60000,
			}
		);

		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Perform fresh login
		console.log('Performing fresh login...');
		await login(page, env.AUTH_USERNAME, env.AUTH_PASSWORD);
		await selectDatabase(page, DATABASE_NAME);

		console.log('✅ Fresh session established');
	} catch (error) {
		console.error('Failed to clean session:', error);
		throw error;
	}
}

async function processCalendar(
	page: Page,
	calendarPath: { name: string; path: string[] },
	downloadPath: string
): Promise<void> {
	console.log(`\n${'='.repeat(60)}`);
	console.log(`Processing calendar: ${calendarPath.name}`);
	console.log(`${'='.repeat(60)}\n`);

	try {
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
		const exportDir = path.join(process.cwd(), 'export', calendarPath.name);

		// Export the calendar
		await exportCalendar(page, downloadPath, exportDir, filename);

		console.log(
			`\n✅ Successfully exported calendar: ${calendarPath.name}\n`
		);
	} catch (error) {
		console.error(
			`❌ Error processing calendar ${calendarPath.name}:`,
			error
		);
		throw error; // Re-throw to be caught by main
	}
}

async function main() {
	console.log('Starting browser...');
	console.log('DEBUG_MODE env value:', env.DEBUG_MODE);
	console.log('DEBUG_MODE type:', typeof env.DEBUG_MODE);

	const isDebugMode = env.DEBUG_MODE === true;
	console.log('isDebugMode:', isDebugMode);
	console.log('headless:', !isDebugMode);

	const browser = await puppeteer.launch({
		headless: !isDebugMode,
		defaultViewport: isDebugMode ? null : { width: 1920, height: 1080 },
		args: isDebugMode
			? ['--start-maximized']
			: [
					'--start-maximized',
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
					'--disable-gpu',
					'--window-size=1920,1080',
			  ],
		executablePath: env.CHROMIUM_PATH,
	});

	try {
		const page = await browser.newPage();

		// Set up download behavior - convert relative path to absolute
		const downloadPath = path.isAbsolute(env.DOWNLOAD_PATH)
			? env.DOWNLOAD_PATH
			: path.join(process.cwd(), env.DOWNLOAD_PATH);

		// Create downloads directory if it doesn't exist
		if (!fs.existsSync(downloadPath)) {
			fs.mkdirSync(downloadPath, { recursive: true });
			console.log(`Created downloads directory: ${downloadPath}`);
		}

		// Configure browser download behavior
		const client = await page.createCDPSession();
		await client.send('Page.setDownloadBehavior', {
			behavior: 'allow',
			downloadPath: downloadPath,
		});

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

		// Initial login
		console.log('Performing initial login...');
		await login(page, env.AUTH_USERNAME, env.AUTH_PASSWORD);
		await selectDatabase(page, DATABASE_NAME);

		// Track successful and failed exports
		const results = {
			successful: [] as string[],
			failed: [] as Array<{ name: string; error: string }>,
		};

		// Process each calendar
		for (let i = 0; i < CALENDAR_PATHS.length; i++) {
			const calendarPath = CALENDAR_PATHS[i];
			if (!calendarPath) continue;

			try {
				// Ensure we're logged in before processing
				await ensureLoggedIn(page);

				// Process the calendar
				await processCalendar(page, calendarPath, downloadPath);

				// Only mark as successful after export completes
				results.successful.push(calendarPath.name);

				// Clean session and re-login for next calendar (except for the last one)
				// This is necessary because the server invalidates the session after ICS export
				if (i < CALENDAR_PATHS.length - 1) {
					console.log('Preparing for next calendar...');
					await cleanSessionAndRelogin(page);
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				console.error(
					`\n❌ Failed to process calendar ${calendarPath.name}:`
				);
				console.error(errorMessage);
				results.failed.push({
					name: calendarPath.name,
					error: errorMessage,
				});

				// Try to recover for next calendar
				if (i < CALENDAR_PATHS.length - 1) {
					console.log('Attempting to recover for next calendar...');
					try {
						await page.goto(
							'https://ade-production.ut-capitole.fr/direct/index.jsp',
							{
								waitUntil: 'networkidle2',
								timeout: 60000,
							}
						);
						await new Promise((resolve) =>
							setTimeout(resolve, 2000)
						);
					} catch (recoveryError) {
						console.error('Recovery failed:', recoveryError);
					}
				}
			}
		}

		// Print summary
		console.log('\n' + '='.repeat(60));
		console.log('EXPORT SUMMARY');
		console.log('='.repeat(60));
		console.log(`✅ Successful: ${results.successful.length}`);
		results.successful.forEach((name) => {
			console.log(`   - ${name}`);
		});

		if (results.failed.length > 0) {
			console.log(`\n❌ Failed: ${results.failed.length}`);
			results.failed.forEach(({ name, error }) => {
				console.log(`   - ${name}: ${error}`);
			});
		}
		console.log('='.repeat(60) + '\n');

		// Keep browser open briefly in debug mode
		if (isDebugMode) {
			console.log('Debug mode: keeping browser open for 30 seconds...');
			await new Promise((resolve) => setTimeout(resolve, 30000));
		}
	} catch (error) {
		console.error('❌ Critical error in main:', error);
		throw error;
	} finally {
		console.log('Closing browser...');
		await browser.close();
		console.log('Program ended.');
	}
}

main().catch((error) => {
	console.error('❌ Unhandled error:', error);
	process.exit(1);
});
