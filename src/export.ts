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
	console.log('✅ Clicked export button');

	console.log('⏳ Waiting 2s for export dialog...');
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Set the export date range using EXPORT_TIME
	console.log(
		`🔧 Setting export END date to ${EXPORT_TIME} days from today...`
	);
	console.log('🔧 Starting date range configuration...');

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
		console.log('🔍 Checking if calendar is visible...');
		const calendarVisible = await page.evaluate(() => {
			// Look specifically for the calendar inside the date menu popup
			const calendar = document.querySelector(
				'.x-date-menu .x-date-picker'
			);
			const leftArrow = document.querySelector(
				'.x-date-menu .x-date-left-icon'
			);
			const rightArrow = document.querySelector(
				'.x-date-menu .x-date-right-icon'
			);
			const monthButton = document.querySelector(
				'.x-date-menu .x-date-middle button.x-btn-text'
			);

			console.log('🔍 Calendar elements check (in date menu):');
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

			const isVisible = !!calendar;
			console.log(`  - Calendar visible result: ${isVisible}`);

			return isVisible;
		});

		console.log(`📊 DEBUG: calendarVisible = ${calendarVisible}`);

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

		// Navigate to the correct month using the month picker overlay
		console.log(`🎯 Navigating to target month using month picker...`);
		console.log(
			`📅 Current: ${targetDate.todayMonth + 1}/${
				targetDate.todayYear
			}, Target: ${targetDate.month + 1}/${targetDate.year}`
		);

		// First check if month picker is already open
		let monthPickerVisible = await page.evaluate(() => {
			// Look for month picker in the date menu popup only
			const monthPicker = document.querySelector(
				'.x-date-menu .x-date-mp'
			);
			if (monthPicker) {
				const style = window.getComputedStyle(monthPicker);
				const isOpen = style.display !== 'none';
				console.log(
					`🔍 Month picker already open: ${isOpen}, display: ${style.display}`
				);
				return isOpen;
			}
			return false;
		});

		// If month picker is not already open, click the month button to open it
		if (!monthPickerVisible) {
			console.log('🖱️ Clicking month button to open month picker...');
			const monthButtonClicked = await page.evaluate(() => {
				// Click the month button in the date menu popup only
				const monthButton = document.querySelector(
					'.x-date-menu .x-date-middle button.x-btn-text'
				) as HTMLElement;
				if (monthButton) {
					console.log(
						'✓ Found month button:',
						monthButton.textContent?.trim()
					);
					monthButton.click();
					return true;
				} else {
					console.log('✗ Month button not found');
					return false;
				}
			});

			if (!monthButtonClicked) {
				console.warn(
					'⚠️ Could not click month button, skipping navigation'
				);
			} else {
				console.log('✅ Month button clicked');

				// Wait for month picker overlay to appear
				console.log('⏳ Waiting for month picker overlay to appear...');
				await new Promise((resolve) => setTimeout(resolve, 500));

				// Verify month picker is visible
				monthPickerVisible = await page.evaluate(() => {
					// Check month picker in date menu popup only
					const monthPicker = document.querySelector(
						'.x-date-menu .x-date-mp'
					);
					if (monthPicker) {
						const style = window.getComputedStyle(monthPicker);
						const isVisible = style.display !== 'none';
						console.log(
							'✓ Month picker found, display:',
							style.display
						);
						return isVisible;
					} else {
						console.log('✗ Month picker not found');
						return false;
					}
				});
			}
		} else {
			console.log('✅ Month picker is already open');
		}

		if (monthPickerVisible) {
			console.log('✅ Month picker is visible');

			// Click the target month in the picker
			const monthNames = [
				'Jan',
				'Feb',
				'Mar',
				'Apr',
				'May',
				'Jun',
				'Jul',
				'Aug',
				'Sep',
				'Oct',
				'Nov',
				'Dec',
			];
			const targetMonthName = monthNames[targetDate.month];

			console.log(`🖱️ Clicking month "${targetMonthName}" in picker...`);
			const monthClicked = await page.evaluate((monthName) => {
				// Click month in the date menu popup only
				const monthCells = Array.from(
					document.querySelectorAll('.x-date-menu .x-date-mp-month a')
				);
				const targetCell = monthCells.find(
					(cell) => cell.textContent?.trim() === monthName
				);
				if (targetCell) {
					console.log(`✓ Found month "${monthName}", clicking...`);
					(targetCell as HTMLElement).click();
					return true;
				} else {
					console.log(`✗ Month "${monthName}" not found`);
					return false;
				}
			}, targetMonthName);

			if (!monthClicked) {
				console.warn(`⚠️ Could not click month "${targetMonthName}"`);
			} else {
				console.log(`✅ Clicked month "${targetMonthName}"`);
			}

			// Wait a bit for the month to be selected
			await new Promise((resolve) => setTimeout(resolve, 300));

			// Click the year if needed (should already be 2025)
			if (targetDate.year !== targetDate.todayYear) {
				console.log(
					`🖱️ Clicking year "${targetDate.year}" in picker...`
				);
				const yearClicked = await page.evaluate((year) => {
					// Click year in the date menu popup only
					const yearCells = Array.from(
						document.querySelectorAll(
							'.x-date-menu .x-date-mp-year a'
						)
					);
					const targetCell = yearCells.find(
						(cell) => cell.textContent?.trim() === year.toString()
					);
					if (targetCell) {
						console.log(`✓ Found year "${year}", clicking...`);
						(targetCell as HTMLElement).click();
						return true;
					} else {
						console.log(`✗ Year "${year}" not found`);
						return false;
					}
				}, targetDate.year);

				if (!yearClicked) {
					console.warn(
						`⚠️ Could not click year "${targetDate.year}"`
					);
				} else {
					console.log(`✅ Clicked year "${targetDate.year}"`);
				}

				await new Promise((resolve) => setTimeout(resolve, 300));
			}

			// Click OK button in the month picker
			console.log('🖱️ Clicking OK button in month picker...');
			const okClicked = await page.evaluate(() => {
				// Click OK in the date menu popup only
				const okButton = document.querySelector(
					'.x-date-menu .x-date-mp-ok'
				) as HTMLElement;
				if (okButton) {
					console.log('✓ Found OK button, clicking...');
					okButton.click();
					return true;
				} else {
					console.log('✗ OK button not found');
					return false;
				}
			});

			if (!okClicked) {
				console.warn('⚠️ Could not click OK button in month picker');
			} else {
				console.log('✅ OK button clicked in month picker');
			}

			// Wait for month picker to close and calendar to update
			console.log('⏳ Waiting for calendar to update...');
			await new Promise((resolve) => setTimeout(resolve, 800));

			// Verify the month changed
			const updatedMonth = await page.evaluate(() => {
				// Check month in the date menu popup only
				const monthButton = document.querySelector(
					'.x-date-menu .x-date-middle button.x-btn-text'
				);
				return monthButton
					? monthButton.textContent?.trim()
					: 'UNKNOWN';
			});
			console.log(`📅 Calendar now showing: ${updatedMonth}`);
		} else {
			console.warn('⚠️ Month picker not visible, skipping navigation');
		}

		// Wait for the calendar to stabilize
		console.log('⏳ Waiting for calendar to stabilize...');
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Click the target day
		console.log(`🔍 Looking for day ${targetDate.day} in calendar...`);

		// Clear any selection before clicking the day
		console.log('🧹 Clearing selection before clicking day...');
		await page.evaluate(() => {
			const selection = window.getSelection();
			if (selection) {
				selection.removeAllRanges();
				console.log('✓ Selection cleared');
			}
		});
		await new Promise((resolve) => setTimeout(resolve, 300));

		const dayClicked = await page.evaluate((day) => {
			// Only look for cells with x-date-active (current month) and NOT x-date-prevday or x-date-nextday
			// AND only in the date menu popup
			const dateCells = Array.from(
				document.querySelectorAll(
					'.x-date-menu td[role="presentation"]'
				)
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
				// Click the anchor link inside the TD, not the TD itself
				const anchor = targetCell.querySelector('a[role="gridcell"]');
				if (anchor) {
					console.log(`✓ Clicking anchor link for day ${day}...`);
					(anchor as HTMLElement).click();
					return true;
				} else {
					console.log(`✗ Anchor link not found for day ${day}`);
					// Fallback to clicking TD
					console.log(`✓ Fallback: Clicking TD for day ${day}...`);
					(targetCell as HTMLElement).click();
					return true;
				}
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

				// Use the month picker to navigate to the correct month
				console.log(
					'🔄 Retry: Opening month picker and selecting correct month...'
				);

				// Click the month button
				await page.evaluate(() => {
					// Click in date menu popup only
					const monthButton = document.querySelector(
						'.x-date-menu .x-date-middle button.x-btn-text'
					) as HTMLElement;
					if (monthButton) {
						monthButton.click();
					}
				});
				await new Promise((resolve) => setTimeout(resolve, 500));

				// Click December in the month picker
				await page.evaluate(() => {
					// Click in date menu popup only
					const monthCells = Array.from(
						document.querySelectorAll(
							'.x-date-menu .x-date-mp-month a'
						)
					);
					const decCell = monthCells.find(
						(cell) => cell.textContent?.trim() === 'Dec'
					);
					if (decCell) {
						console.log(
							'🔄 Retry: Clicking Dec in month picker...'
						);
						(decCell as HTMLElement).click();
					}
				});
				await new Promise((resolve) => setTimeout(resolve, 300));

				// Click OK in month picker
				await page.evaluate(() => {
					// Click in date menu popup only
					const okButton = document.querySelector(
						'.x-date-menu .x-date-mp-ok'
					) as HTMLElement;
					if (okButton) {
						console.log('🔄 Retry: Clicking OK in month picker...');
						okButton.click();
					}
				});
				await new Promise((resolve) => setTimeout(resolve, 800));

				// Click day 23 again
				await page.evaluate((day) => {
					// Click in date menu popup only
					const dateCells = Array.from(
						document.querySelectorAll(
							'.x-date-menu td[role="presentation"]'
						)
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
						// Click the anchor link, not the TD
						const anchor =
							targetCell.querySelector('a[role="gridcell"]');
						if (anchor) {
							console.log(
								`🔄 Re-clicking anchor link for day ${day}...`
							);
							(anchor as HTMLElement).click();
						} else {
							console.log(`🔄 Re-clicking TD for day ${day}...`);
							(targetCell as HTMLElement).click();
						}
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
