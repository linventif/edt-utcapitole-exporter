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
				'SUCCESS: Database opened! We are now on the schedule page.'
			);

			// Now navigate the tree structure
			console.log('Starting tree navigation...');

			// Wait for the tree structure to load properly
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Step 1: Click on Trainees expand icon
			console.log('Step 1: Clicking on Trainees expand icon...');
			try {
				// Find and click the joint (expand icon) within the Trainees element
				const traineesJointClicked = await page.evaluate(() => {
					const traineesCell = document.getElementById('x-auto-247');
					if (traineesCell) {
						const jointImg = traineesCell.querySelector(
							'img.x-tree3-node-joint'
						);
						if (jointImg) {
							(jointImg as HTMLElement).click();
							console.log('Clicked Trainees expand icon');
							return true;
						}
					}
					return false;
				});

				if (traineesJointClicked) {
					console.log('Successfully clicked Trainees expand icon');
				} else {
					throw new Error('Could not find Trainees expand icon');
				}
			} catch (error) {
				console.log(
					'Fallback: trying to click Trainees cell directly:',
					error
				);
				await page.click('#x-auto-247');
			}

			// Wait for expansion
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Step 2: Click on UFR Informatique expand icon
			console.log('Step 2: Clicking on UFR Informatique expand icon...');
			try {
				// Find and click the joint (expand icon) within the UFR Informatique element
				const ufrJointClicked = await page.evaluate(() => {
					const ufrCell = document.getElementById('x-auto-292');
					if (ufrCell) {
						const jointImg = ufrCell.querySelector(
							'img.x-tree3-node-joint'
						);
						if (jointImg) {
							(jointImg as HTMLElement).click();
							console.log('Clicked UFR Informatique expand icon');
							return true;
						}
					}
					return false;
				});

				if (ufrJointClicked) {
					console.log(
						'Successfully clicked UFR Informatique expand icon'
					);
				} else {
					throw new Error(
						'Could not find UFR Informatique expand icon'
					);
				}
			} catch (error) {
				console.log(
					'Fallback: trying to click UFR Informatique cell directly:',
					error
				);
				await page.click('#x-auto-292');
			}

			// Wait for expansion
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Step 3: Click on M1 MIAGE to select it (final selection)
			console.log('Step 3: Clicking on M1 MIAGE...');
			try {
				await page.click('#x-auto-316');
				console.log('Successfully clicked M1 MIAGE element');
			} catch (error) {
				console.log(
					'Direct click failed, trying fallback for M1 MIAGE:',
					error
				);
				// Fallback: Find M1 MIAGE by text content
				await page.evaluate(() => {
					const treeTexts = Array.from(
						document.querySelectorAll('span.x-tree3-node-text')
					);
					const miageElement = treeTexts.find(
						(span) => span.textContent?.trim() === 'M1 MIAGE'
					);

					if (miageElement) {
						console.log(
							'Found M1 MIAGE element via fallback, clicking...'
						);
						(miageElement as HTMLElement).click();
					}
				});
			}

			console.log('Tree navigation completed successfully!');

			// Wait a moment for the schedule to fully load
			await new Promise((resolve) => setTimeout(resolve, 3000));

			// Extract date information for filename
			console.log('Extracting date information for filename...');
			const dateInfo = await page.evaluate(() => {
				const dateLabels = Array.from(
					document.querySelectorAll('.labelLegend')
				);
				let startDate = '';
				let endDate = '';

				// Look for date patterns in the labels
				dateLabels.forEach((label) => {
					const text = label.textContent?.trim();
					if (text && text.includes('/')) {
						// Extract dates like "Lundi 08/09/2025" or "Dimanche 14/09/2025"
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

			// Format the filename based on the extracted dates
			let baseFilename = 'schedule';
			if (dateInfo.startDate && dateInfo.endDate) {
				// Convert DD/MM/YYYY to YYYY-MM-DD format
				const formatDate = (dateStr: string) => {
					const [day, month, year] = dateStr.split('/');
					return `${year}-${month}-${day}`;
				};

				const formattedStartDate = formatDate(dateInfo.startDate);
				const formattedEndDate = formatDate(dateInfo.endDate);
				baseFilename = `${formattedStartDate}_to_${formattedEndDate}`;
			}

			console.log(`Target filename: ${baseFilename}.ics`);
			console.log(
				`Date range: ${dateInfo.startDate} to ${dateInfo.endDate}`
			); // Export as ICS file by clicking the export button
			console.log('Clicking export button to generate ICS file...');
			try {
				// Click the export button using the provided ID
				await page.click('#x-auto-142');
				console.log('Clicked export button');

				// Wait for popup to appear
				await new Promise((resolve) => setTimeout(resolve, 2000));

				// Look for and click the OK button in the popup
				console.log('Looking for OK button in popup...');
				const okClicked = await page.evaluate(() => {
					// Look for the shadow popup first
					const shadowElement =
						document.querySelector('.x-shadow.x-ignore');
					if (shadowElement) {
						console.log('Found popup shadow element');
					}

					// Look for OK button
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

				if (okClicked) {
					console.log(
						'✅ OK button clicked - ICS download should start'
					);

					// Wait for download to complete
					await new Promise((resolve) => setTimeout(resolve, 5000));

					// Move the downloaded file from DOWNLOAD_PATH to export directory
					const fs = require('fs');
					const path = require('path');

					const exportDir = path.join(process.cwd(), 'export');
					if (!fs.existsSync(exportDir)) {
						fs.mkdirSync(exportDir, { recursive: true });
						console.log('Created export directory');
					}

					// Try to find the downloaded ICS file in the download directory
					const downloadDir = env.DOWNLOAD_PATH;
					const targetPath = path.join(
						exportDir,
						`${baseFilename}.ics`
					);

					try {
						// Look for .ics files in download directory
						const files = fs.readdirSync(downloadDir);
						const icsFiles = files.filter((file: string) =>
							file.endsWith('.ics')
						);

						if (icsFiles.length > 0) {
							// Sort by modification time to get the most recent file
							const icsFilesWithStats = icsFiles.map(
								(file: string) => ({
									name: file,
									path: path.join(downloadDir, file),
									stat: fs.statSync(
										path.join(downloadDir, file)
									),
								})
							);

							// Sort by modification time (most recent first)
							icsFilesWithStats.sort(
								(a: any, b: any) =>
									b.stat.mtime.getTime() -
									a.stat.mtime.getTime()
							);

							const mostRecentFile = icsFilesWithStats[0];
							const sourcePath = mostRecentFile.path;

							console.log(
								`Found ${icsFiles.length} ICS file(s), using most recent: ${mostRecentFile.name}`
							);

							fs.copyFileSync(sourcePath, targetPath);

							// Optional: remove the original download file
							fs.unlinkSync(sourcePath);

							console.log(
								`✅ ICS file successfully moved to: ${targetPath}`
							);
						} else {
							console.log(
								'❌ No ICS file found in download directory'
							);
							console.log(`Checked directory: ${downloadDir}`);
						}
					} catch (error) {
						console.log('Error moving ICS file:', error);
						console.log(
							'File may need to be moved manually from download folder'
						);
					}
				} else {
					console.log('❌ Could not find or click OK button');
				}
			} catch (error) {
				console.log('Export process failed:', error);
			}
		} else {
			console.log(
				'Database may not have opened properly, checking what happened...'
			);
		}

		// Keep the browser open for manual interaction
		console.log('Keeping browser open for 2 minutes to see the results...');
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
