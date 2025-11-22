import { Page } from 'puppeteer';
import type { DateInfo } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { EXPORT_TIME } from './config';

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

	// Set the export date range using EXPORT_TIME
	console.log(
		`🔧 Setting export END date to ${EXPORT_TIME} days from today...`
	);

	// Wait for the export dialog to be visible
	console.log('⏳ Waiting 1s for export dialog to be fully loaded...');
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Click the END DATE calendar trigger button (second date picker in the Period fieldset)
	console.log('🔍 Searching for End Date calendar trigger...');
	const calendarTriggerClicked = await page.evaluate(() => {
		// Find the "End Date" label first to ensure we get the right trigger
		const labels = Array.from(
			document.querySelectorAll('label.x-form-item-label')
		);
		console.log(`📋 Found ${labels.length} form labels`);

		const endDateLabel = labels.find((label) =>
			label.textContent?.includes('End Date')
		);

		if (endDateLabel) {
			console.log(
				'✓ Found End Date label:',
				endDateLabel.textContent?.trim()
			);
			// Find the trigger button associated with End Date
			const formItem = endDateLabel.closest('.x-form-item');
			if (formItem) {
				console.log('✓ Found form item container');
				const trigger = formItem.querySelector(
					'img.x-form-trigger.x-form-date-trigger'
				);
				if (trigger) {
					console.log(
						'✓ Found End Date calendar trigger, clicking...'
					);
					(trigger as HTMLElement).click();
					return true;
				} else {
					console.log('✗ Trigger not found in form item');
				}
			} else {
				console.log('✗ Form item container not found');
			}
		} else {
			console.log('✗ End Date label not found');
		}

		// Fallback: try to find all date triggers and click the second one (End Date)
		const triggers = Array.from(
			document.querySelectorAll('img.x-form-trigger.x-form-date-trigger')
		);
		console.log(`📋 Found ${triggers.length} date triggers total`);
		if (triggers.length >= 2) {
			console.log(
				'⚠️ Using fallback: clicking second date trigger (End Date)...'
			);
			(triggers[1] as HTMLElement).click();
			return true;
		}

		console.log('✗ Not enough date triggers found for fallback');
		return false;
	});

	if (!calendarTriggerClicked) {
		console.warn(
			'⚠️ Could not find calendar trigger, continuing with default date...'
		);
	} else {
		console.log('✅ Calendar trigger clicked successfully');

		// Wait for calendar to appear
		console.log('⏳ Waiting 1s for calendar picker to appear...');
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Verify calendar is visible
		const calendarVisible = await page.evaluate(() => {
			const calendar = document.querySelector('.x-date-picker');
			const leftArrow = document.querySelector('.x-date-left-icon');
			const rightArrow = document.querySelector('.x-date-right-icon');
			const monthButton = document.querySelector(
				'.x-date-middle button.x-btn-text'
			);

			console.log('🔍 Calendar elements check:');
			console.log('  - Calendar picker:', calendar ? '✓' : '✗');
			console.log('  - Left arrow:', leftArrow ? '✓' : '✗');
			console.log('  - Right arrow:', rightArrow ? '✓' : '✗');
			console.log('  - Month button:', monthButton ? '✓' : '✗');
			if (monthButton) {
				console.log(
					'  - Current month text:',
					monthButton.textContent?.trim()
				);
			}

			return !!calendar;
		});

		if (!calendarVisible) {
			console.warn(
				'⚠️ Calendar picker not visible, skipping date selection'
			);
			return;
		}

		// Calculate target date (today + EXPORT_TIME days)
		console.log(
			`📅 Calculating target date (today + ${EXPORT_TIME} days)...`
		);
		const targetDate = await page.evaluate((daysToAdd) => {
			const today = new Date();
			const target = new Date(today);
			target.setDate(today.getDate() + daysToAdd);

			const result = {
				day: target.getDate(),
				month: target.getMonth(), // 0-indexed
				year: target.getFullYear(),
				todayDay: today.getDate(),
				todayMonth: today.getMonth(),
				todayYear: today.getFullYear(),
			};

			console.log(
				'📅 Today:',
				`${result.todayDay}/${result.todayMonth + 1}/${
					result.todayYear
				}`
			);
			console.log(
				'📅 Target:',
				`${result.day}/${result.month + 1}/${result.year}`
			);

			return result;
		}, EXPORT_TIME);

		console.log(
			`🎯 Target date calculated: ${targetDate.day}/${
				targetDate.month + 1
			}/${targetDate.year}`
		);

		// Navigate to the correct month if needed
		const monthsToNavigate =
			(targetDate.year - targetDate.todayYear) * 12 +
			(targetDate.month - targetDate.todayMonth);

		// Focus on the calendar picker for keyboard navigation
		console.log(
			'🎯 Focusing on calendar picker for keyboard navigation...'
		);
		const focused = await page.evaluate(() => {
			// Find the calendar picker that's currently visible
			const calendar = document.querySelector(
				'.x-date-picker'
			) as HTMLElement;
			if (calendar) {
				calendar.focus();
				console.log('✓ Calendar picker focused');
				return true;
			} else {
				console.log('✗ Calendar picker not found');
				return false;
			}
		});

		if (!focused) {
			console.warn(
				'⚠️ Could not focus calendar picker, trying input field...'
			);
			await page.evaluate(() => {
				const labels = Array.from(
					document.querySelectorAll('label.x-form-item-label')
				);
				const endDateLabel = labels.find((label) =>
					label.textContent?.includes('End Date')
				);
				if (endDateLabel) {
					const formItem = endDateLabel.closest('.x-form-item');
					if (formItem) {
						const input = formItem.querySelector(
							'input.x-form-field'
						) as HTMLInputElement;
						if (input) {
							input.focus();
							console.log('✓ End Date input focused as fallback');
						}
					}
				}
			});
		}
		await new Promise((resolve) => setTimeout(resolve, 500));

		if (monthsToNavigate > 0) {
			console.log(
				`➡️ Navigating ${monthsToNavigate} month(s) forward...`
			);
			for (let i = 0; i < monthsToNavigate; i++) {
				console.log(`  Month ${i + 1}/${monthsToNavigate}...`);
				// Use CTRL+ArrowRight to navigate months
				await page.keyboard.down('Control');
				await page.keyboard.press('ArrowRight');
				await page.keyboard.up('Control');
				console.log('  ✓ Pressed Ctrl+ArrowRight');
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
			console.log('✅ Month navigation complete');
		} else if (monthsToNavigate < 0) {
			console.log(
				`⬅️ Navigating ${Math.abs(
					monthsToNavigate
				)} month(s) backward...`
			);
			for (let i = 0; i < Math.abs(monthsToNavigate); i++) {
				console.log(
					`  Month ${i + 1}/${Math.abs(monthsToNavigate)}...`
				);
				// Use CTRL+ArrowLeft to navigate months backward
				await page.keyboard.down('Control');
				await page.keyboard.press('ArrowLeft');
				await page.keyboard.up('Control');
				console.log('  ✓ Pressed Ctrl+ArrowLeft');
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
			console.log('✅ Month navigation complete');
		} else {
			console.log('✓ Already in correct month, no navigation needed');
		}

		// Wait a bit longer for the calendar to stabilize after navigation
		console.log('⏳ Waiting for calendar to stabilize after navigation...');
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Verify which month is actually displayed
		const displayedMonth = await page.evaluate(() => {
			const monthButton = document.querySelector(
				'.x-date-middle button.x-btn-text'
			);
			return monthButton ? monthButton.textContent?.trim() : null;
		});
		console.log(`📅 Calendar now showing: ${displayedMonth || 'UNKNOWN'}`);

		// Double-check the calendar is still open and showing the right month
		const calendarStillValid = await page.evaluate(
			(expectedMonth, expectedYear) => {
				const monthButton = document.querySelector(
					'.x-date-middle button.x-btn-text'
				);
				const monthText = monthButton
					? monthButton.textContent?.trim()
					: '';

				// Check if calendar is showing the expected month/year
				const monthNames = [
					'January',
					'February',
					'March',
					'April',
					'May',
					'June',
					'July',
					'August',
					'September',
					'October',
					'November',
					'December',
				];
				const expectedText = `${monthNames[expectedMonth]} ${expectedYear}`;

				console.log(
					`🔍 Expecting: "${expectedText}", Found: "${monthText}"`
				);
				return monthText === expectedText;
			},
			targetDate.month,
			targetDate.year
		);

		if (!calendarStillValid) {
			console.warn(
				'⚠️ Calendar not showing correct month! Re-opening calendar...'
			);

			// Re-click the End Date trigger to open calendar again
			const reopened = await page.evaluate(() => {
				const labels = Array.from(
					document.querySelectorAll('label.x-form-item-label')
				);
				const endDateLabel = labels.find((label) =>
					label.textContent?.includes('End Date')
				);
				if (endDateLabel) {
					const formItem = endDateLabel.closest('.x-form-item');
					if (formItem) {
						const trigger = formItem.querySelector(
							'img.x-form-trigger.x-form-date-trigger'
						);
						if (trigger) {
							(trigger as HTMLElement).click();
							return true;
						}
					}
				}
				return false;
			});

			if (reopened) {
				console.log('✓ Calendar re-opened, waiting...');
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		// Click the target day
		console.log(`🔍 Looking for day ${targetDate.day} in calendar...`);

		// First, double-check we're on the right month RIGHT before clicking
		const monthBeforeClick = await page.evaluate(() => {
			const monthButton = document.querySelector(
				'.x-date-middle button.x-btn-text'
			);
			return monthButton ? monthButton.textContent?.trim() : null;
		});
		console.log(
			`📅 Month immediately before clicking day: ${monthBeforeClick}`
		);

		// If not on correct month, try navigating one more time
		if (!monthBeforeClick?.includes('December') && monthsToNavigate > 0) {
			console.warn(
				'⚠️ Calendar reverted to wrong month! Re-navigating...'
			);
			console.log('🔄 Pressing ArrowRight key again...');
			await page.keyboard.press('ArrowRight');
			await new Promise((resolve) => setTimeout(resolve, 800));
		}

		const dayClicked = await page.evaluate((day) => {
			// Only look for cells with x-date-active (current month) and NOT x-date-prevday or x-date-nextday
			const dateCells = Array.from(
				document.querySelectorAll('td[role="presentation"]')
			);

			// Filter to only cells from the current month (have x-date-active but not x-date-prevday or x-date-nextday)
			const currentMonthCells = dateCells.filter((cell) => {
				const classes = cell.className;
				return (
					classes.includes('x-date-active') &&
					!classes.includes('x-date-prevday') &&
					!classes.includes('x-date-nextday')
				);
			});

			console.log(
				`📋 Found ${currentMonthCells.length} date cells in current month`
			);

			const targetCell = currentMonthCells.find((cell) => {
				const span = cell.querySelector('span');
				const cellDay = span?.textContent?.trim();
				console.log(`  Checking cell: day ${cellDay}`);
				return cellDay === day.toString();
			});

			if (targetCell) {
				console.log(
					`✓ Found target cell for day ${day} in current month`
				);
				// Click the TD element itself, not the link inside
				console.log(`✓ Clicking TD for day ${day}...`);
				(targetCell as HTMLElement).click();
				return true;
			} else {
				console.log(
					`✗ Target cell for day ${day} not found in current month`
				);
			}
			return false;
		}, targetDate.day);

		if (dayClicked) {
			console.log(
				`✅ Successfully selected date: ${targetDate.day}/${
					targetDate.month + 1
				}/${targetDate.year}`
			);
		} else {
			console.warn('⚠️ Could not click target day, using default');
		}

		console.log('⏳ Waiting 1s after date selection...');
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Verify the actual value in the End Date input field
		const selectedDateValue = await page.evaluate(() => {
			// Find the End Date input field
			const labels = Array.from(
				document.querySelectorAll('label.x-form-item-label')
			);
			const endDateLabel = labels.find((label) =>
				label.textContent?.includes('End Date')
			);

			if (endDateLabel) {
				const formItem = endDateLabel.closest('.x-form-item');
				if (formItem) {
					const input = formItem.querySelector(
						'input.x-form-field'
					) as HTMLInputElement;
					if (input) {
						return input.value;
					}
				}
			}
			return null;
		});

		console.log(
			`🔍 End Date input field value: ${selectedDateValue || 'NOT FOUND'}`
		);

		// Check if the date is correct (should be in December, not November)
		const expectedDateStr = `23/12/${targetDate.year}`;
		if (selectedDateValue && selectedDateValue !== expectedDateStr) {
			console.warn(
				`⚠️ Date mismatch! Expected: ${expectedDateStr}, Got: ${selectedDateValue}`
			);
			console.log(
				'🔄 Attempting to fix by re-opening calendar and selecting date again...'
			);

			// Re-open the calendar
			const reopened = await page.evaluate(() => {
				const labels = Array.from(
					document.querySelectorAll('label.x-form-item-label')
				);
				const endDateLabel = labels.find((label) =>
					label.textContent?.includes('End Date')
				);
				if (endDateLabel) {
					const formItem = endDateLabel.closest('.x-form-item');
					if (formItem) {
						const trigger = formItem.querySelector(
							'img.x-form-trigger.x-form-date-trigger'
						);
						if (trigger) {
							(trigger as HTMLElement).click();
							return true;
						}
					}
				}
				return false;
			});

			if (reopened) {
				await new Promise((resolve) => setTimeout(resolve, 1000));

				// Focus the input and navigate to December again using CTRL+Arrow keys
				await page.evaluate(() => {
					const labels = Array.from(
						document.querySelectorAll('label.x-form-item-label')
					);
					const endDateLabel = labels.find((label) =>
						label.textContent?.includes('End Date')
					);
					if (endDateLabel) {
						const formItem = endDateLabel.closest('.x-form-item');
						if (formItem) {
							const input = formItem.querySelector(
								'input.x-form-field'
							) as HTMLInputElement;
							if (input) {
								input.focus();
							}
						}
					}
				});
				await new Promise((resolve) => setTimeout(resolve, 500));

				for (let i = 0; i < monthsToNavigate; i++) {
					await page.keyboard.down('Control');
					await page.keyboard.press('ArrowRight');
					await page.keyboard.up('Control');
					await new Promise((resolve) => setTimeout(resolve, 500));
				}

				await new Promise((resolve) => setTimeout(resolve, 1000));

				// Click day 23 again
				await page.evaluate((day) => {
					const dateCells = Array.from(
						document.querySelectorAll('td[role="presentation"]')
					);
					const currentMonthCells = dateCells.filter((cell) => {
						const classes = cell.className;
						return (
							classes.includes('x-date-active') &&
							!classes.includes('x-date-prevday') &&
							!classes.includes('x-date-nextday')
						);
					});

					const targetCell = currentMonthCells.find((cell) => {
						const span = cell.querySelector('span');
						return span?.textContent?.trim() === day.toString();
					});

					if (targetCell) {
						console.log(`🔄 Re-clicking TD for day ${day}...`);
						(targetCell as HTMLElement).click();
					}
				}, targetDate.day);

				await new Promise((resolve) => setTimeout(resolve, 1000));
				console.log('✓ Retry complete');
			}
		} else if (selectedDateValue) {
			// Parse the date from the input (format might be DD/MM/YYYY or MM/DD/YYYY)
			console.log(`✓ Date was set in the field`);
		} else {
			console.warn('⚠️ Could not verify End Date input value');
		}
	}

	// ⚠️ BREAKPOINT: Pausing here to inspect the calendar state
	console.log(
		'⚠️ BREAKPOINT: Calendar should be set. Waiting 60 seconds for inspection...'
	);
	console.log(
		'⚠️ Check the browser to verify the date is correct before proceeding.'
	);
	debugger; // This will pause if running with --inspect flag
	await new Promise((resolve) => setTimeout(resolve, 60000)); // 60 second wait
	console.log('⚠️ BREAKPOINT: Resuming after 60 seconds...');

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
