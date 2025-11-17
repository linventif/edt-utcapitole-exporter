import { Page } from 'puppeteer';
import type { DateInfo } from './types';
import * as fs from 'fs';
import * as path from 'path';

export async function extractDateInfo(page: Page): Promise<DateInfo> {
	console.log('Extracting date information...');
	return await page.evaluate(() => {
		const dateLabels = Array.from(
			document.querySelectorAll('.labelLegend')
		);
		let startDate = '';
		let endDate = '';

		dateLabels.forEach((label) => {
			const text = label.textContent?.trim();
			if (text && text.includes('/')) {
				const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
				if (dateMatch && dateMatch[1]) {
					const date = dateMatch[1];
					if (!startDate || date < startDate) {
						startDate = date;
					}
					if (!endDate || date > endDate) {
						endDate = date;
					}
				}
			}
		});

		return { startDate, endDate };
	});
}

export function formatFilename(
	dateInfo: DateInfo,
	calendarName: string
): string {
	// Just return the calendar name without date suffix
	return calendarName;
}

export async function exportCalendar(
	page: Page,
	downloadPath: string,
	exportDir: string,
	filename: string
): Promise<void> {
	console.log('Clicking export button to generate ICS file...');

	await page.click('#x-auto-142');
	console.log('Clicked export button');

	await new Promise((resolve) => setTimeout(resolve, 2000));

	console.log('Looking for OK button in popup...');
	const okClicked = await page.evaluate(() => {
		const buttons = Array.from(
			document.querySelectorAll('button.x-btn-text')
		);
		const okButton = buttons.find(
			(btn) => btn.textContent?.trim().toLowerCase() === 'ok'
		);

		if (okButton) {
			console.log('Found OK button, clicking...');
			(okButton as HTMLElement).click();
			return true;
		}

		console.log('OK button not found');
		return false;
	});

	if (!okClicked) {
		throw new Error('Could not find or click OK button');
	}

	console.log('✅ OK button clicked - ICS download should start');

	// Wait for download to complete
	await new Promise((resolve) => setTimeout(resolve, 5000));

	// Move the downloaded file
	if (!fs.existsSync(exportDir)) {
		fs.mkdirSync(exportDir, { recursive: true });
		console.log('Created export directory');
	}

	const targetPath = path.join(exportDir, `${filename}.ics`);

	// Look for .ics files in download directory
	const files = fs.readdirSync(downloadPath);
	const icsFiles = files.filter((file: string) => file.endsWith('.ics'));

	if (icsFiles.length === 0) {
		throw new Error('No ICS file found in download directory');
	}

	// Sort by modification time to get the most recent file
	const icsFilesWithStats = icsFiles.map((file: string) => ({
		name: file,
		path: path.join(downloadPath, file),
		stat: fs.statSync(path.join(downloadPath, file)),
	}));

	icsFilesWithStats.sort(
		(a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime()
	);

	const mostRecentFile = icsFilesWithStats[0];
	if (!mostRecentFile) {
		throw new Error('No ICS file found after sorting');
	}
	const sourcePath = mostRecentFile.path;

	console.log(
		`Found ${icsFiles.length} ICS file(s), using most recent: ${mostRecentFile.name}`
	);

	fs.copyFileSync(sourcePath, targetPath);
	fs.unlinkSync(sourcePath);

	console.log(`✅ ICS file successfully saved to: ${targetPath}`);
}
