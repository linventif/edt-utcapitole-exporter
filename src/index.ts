import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import { validateEnv } from './envSchema';

// Load environment variables from .env
dotenv.config();

// Validate the environment variables
const env = validateEnv(process.env);

async function main() {
	console.log('Starting browser...');

	// Launch a headful browser (visible window)
	const browser = await puppeteer.launch({
		headless: false, // Set to true if you don't want to see the browser window
		defaultViewport: null, // Use default viewport size
		args: ['--start-maximized'], // Start with maximized window
		executablePath: env.CHROMIUM_PATH, // Path to your Chromium binary
	});

	try {
		const page = await browser.newPage();

		console.log('Navigating to UT Capitole schedule website...');
		await page.goto(
			'https://ade-production.ut-capitole.fr/direct/index.jsp',
			{
				waitUntil: 'networkidle2', // Wait until network is idle
				timeout: 60000, // 60 seconds timeout
			}
		);

		console.log('Filling in login credentials...');

		// Wait for the username field to be available
		await page.waitForSelector('#userfield', { visible: true });
		await page.type('#userfield', env.AUTH_USERNAME);

		// Wait for the password field to be available
		await page.waitForSelector('#passwordfield', { visible: true });
		await page.type('#passwordfield', env.AUTH_PASSWORD);

		// Wait for the login button to be available
		await page.waitForSelector('button.btn.btn-success', { visible: true });
		await page.click('button.btn.btn-success');

		console.log('Login submitted.');

		// Wait for the database selection interface to appear (no navigation occurs)
		console.log('Waiting for database selection listbox...');
		await page.waitForSelector('[role="listbox"]', {
			visible: true,
			timeout: 30000,
		});

		console.log('Login successful - database selection interface loaded.');

		// Wait a bit more for all elements to load properly
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Look for ADEPROD_2025-2026 option and click it
		console.log('Looking for ADEPROD_2025-2026 option...');

		// First, wait specifically for the ADEPROD_2025-2026 element to be present
		await page.waitForFunction(
			() => {
				const spans = Array.from(
					document.querySelectorAll('span.x-editable')
				);
				return spans.some((span) =>
					span.textContent?.includes('ADEPROD_2025-2026')
				);
			},
			{ timeout: 10000 }
		);

		// Wait for and double-click the ADEPROD_2025-2026 option using the correct selector
		console.log('Using Puppeteer click approach...');

		// Find the target element and use Puppeteer's click
		const targetElement = await page.evaluate(() => {
			const spans = Array.from(
				document.querySelectorAll('span.x-editable')
			);

			// Debug: log all available options first
			console.log('Available database options:');
			spans.forEach((span, index) => {
				console.log(`${index}: "${span.textContent?.trim()}"`);
			});

			// Find the exact match for ADEPROD_2025-2026
			const target = spans.find(
				(span) => span.textContent?.trim() === 'ADEPROD_2025-2026'
			);
			if (target) {
				console.log(
					'Found exact ADEPROD_2025-2026 span:',
					target.textContent
				);
				const parentDiv = target.closest('.thumb-wrap');
				if (parentDiv && parentDiv.id) {
					console.log('Found parent div with ID:', parentDiv.id);
					// Mark it for easy identification
					(parentDiv as HTMLElement).style.backgroundColor = 'red';
					(parentDiv as HTMLElement).style.border = '3px solid blue';
					return parentDiv.id;
				}
			}
			return null;
		});

		if (!targetElement) {
			throw new Error('Could not find ADEPROD_2025-2026 option');
		}

		console.log('Target element ID:', targetElement);

		// Use Puppeteer's click method on the target element
		try {
			await page.click(`#${targetElement}`);
			console.log('Clicked target element with Puppeteer');

			// Wait a moment
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Double-click to open
			await page.click(`#${targetElement}`, { clickCount: 2 });
			console.log('Double-clicked target element with Puppeteer');
		} catch (clickError) {
			console.log('Puppeteer click failed, trying fallback:', clickError);

			// Fallback to the evaluate approach
			await page.evaluate((elementId) => {
				const element = document.getElementById(elementId);
				if (element) {
					// Simulate click events
					element.click();
					// Then double-click
					const dblClickEvent = new MouseEvent('dblclick', {
						bubbles: true,
						cancelable: true,
						view: window,
					});
					element.dispatchEvent(dblClickEvent);
					console.log(
						'Fallback: dispatched click + dblclick on element'
					);
				}
			}, targetElement);
		}

		// Wait a moment for the click to register
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Check if we're now on the schedule page
		const isOnSchedulePage1 = await page.evaluate(() => {
			return document.querySelector('.x-tree3-node-text') !== null;
		});

		if (isOnSchedulePage1) {
			console.log(
				'SUCCESS: Database opened! We are now on the schedule page.'
			);
		} else {
			console.log('Still not on schedule page, trying Open button...');

			// Try to find and click the Open button
			const openClicked = await page.evaluate(() => {
				const buttons = Array.from(document.querySelectorAll('button'));
				const openButton = buttons.find(
					(btn) =>
						btn.textContent
							?.trim()
							.toLowerCase()
							.includes('open') ||
						btn.textContent?.trim().toLowerCase().includes('ouvrir')
				);
				if (openButton) {
					console.log('Found Open button, clicking...');
					(openButton as HTMLElement).click();
					return true;
				}
				console.log('Open button not found');
				return false;
			});

			if (openClicked) {
				console.log('Clicked Open button');
			}
		}

		// Debug: check which element is currently selected
		const selectedAfter = await page.evaluate(() => {
			const selected = document.querySelector(
				'.thumb-wrap.x-view-item-sel'
			);
			if (selected) {
				const span = selected.querySelector('span.x-editable');
				console.log(
					'Currently selected after attempts:',
					span?.textContent?.trim()
				);
				return span?.textContent?.trim();
			}
			return null;
		});

		console.log('Selected database after attempts:', selectedAfter);

		// Check if we're now on the schedule page
		const isOnSchedulePage2 = await page.evaluate(() => {
			return document.querySelector('.x-tree3-node-text') !== null;
		});

		if (isOnSchedulePage2) {
			console.log(
				'SUCCESS: Forced selection + Open button worked! We are now on the schedule page.'
			);
		} else {
			console.log(
				'Forced selection + Open button may not have worked, checking what happened...'
			);
		}

		// Wait here for debugging - keep browser open to see what opens
		console.log(
			'DEBUGGING: Pausing here to see which database actually opens...'
		);
		await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute for debugging

		/* COMMENTED OUT FOR DEBUGGING - UNCOMMENT AFTER FIXING SELECTION
		// Wait for the next page to load
		await page.waitForNavigation({
			waitUntil: 'networkidle2',
			timeout: 30000,
		});

		console.log(
			'Navigation completed. You can now interact with the schedule interface.'
		);

		// Wait for the tree structure to load
		console.log('Waiting for tree structure to load...');
		await page.waitForSelector('.x-tree3-node-text', {
			visible: true,
			timeout: 30000,
		});

		// Wait a bit more for all tree elements to load properly
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Click on "Trainees" element
		console.log('Looking for Trainees element...');
		const traineesClicked = await page.evaluate(() => {
			// Method 1: Try clicking the expand/collapse icon (joint) first
			const traineesSpans = Array.from(
				document.querySelectorAll('span.x-tree3-node-text')
			).filter((span) => span.textContent?.trim() === 'Trainees');

			if (traineesSpans.length > 0) {
				const traineesSpan = traineesSpans[0];
				console.log('Found Trainees span:', traineesSpan);

				if (traineesSpan) {
					// Find the tree node container
					const treeEl = traineesSpan.closest('.x-tree3-el');
					if (treeEl) {
						// Look for the joint (expand/collapse) icon
						const jointImg = treeEl.querySelector(
							'img.x-tree3-node-joint'
						);
						if (jointImg) {
							console.log(
								'Found joint icon, clicking to expand...'
							);
							(jointImg as HTMLElement).click();
							return true;
						}

						// If no joint, try clicking the tree element itself
						console.log('No joint found, clicking tree element...');
						(treeEl as HTMLElement).click();
						return true;
					}

					// Fallback: click the span directly
					console.log('Clicking Trainees span directly...');
					(traineesSpan as HTMLElement).click();
					return true;
				}
			}

			// Method 2: Try the td cell approach
			const traineesCell = document.querySelector(
				'td[role="gridcell"].x-treegrid-column'
			);
			if (traineesCell) {
				const traineesSpan = traineesCell.querySelector(
					'span.x-tree3-node-text'
				);
				if (
					traineesSpan &&
					traineesSpan.textContent?.trim() === 'Trainees'
				) {
					console.log('Found Trainees cell, clicking...');
					(traineesCell as HTMLElement).click();
					return true;
				}
			}

			console.log('Could not find Trainees element');
			return false;
		});

		if (traineesClicked) {
			console.log('Successfully clicked on Trainees!');
		} else {
			throw new Error('Could not find or click Trainees element');
		}

		// Wait for the Trainees section to expand
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Click on "UFR Informatique" element
		console.log('Looking for UFR Informatique element...');
		const ufrClicked = await page.evaluate(() => {
			const treeTexts = Array.from(
				document.querySelectorAll('span.x-tree3-node-text')
			);
			const ufrElement = treeTexts.find(
				(span) => span.textContent?.trim() === 'UFR Informatique'
			);
			if (ufrElement) {
				console.log(
					'Found UFR Informatique element, clicking...',
					ufrElement
				);
				(ufrElement as HTMLElement).click();
				return true;
			}
			console.log('Could not find UFR Informatique element');
			return false;
		});

		if (ufrClicked) {
			console.log('Successfully clicked on UFR Informatique!');
		} else {
			throw new Error('Could not find or click UFR Informatique element');
		}

		// Wait for the UFR Informatique section to expand
		await new Promise((resolve) => setTimeout(resolve, 2000));

		console.log('Tree navigation completed successfully.');
		*/

		// Keep the browser open for manual interaction
		await new Promise((resolve) => setTimeout(resolve, 120000)); // 2 minutes timeout
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
	console.log('Program ended gracefully.');
});
