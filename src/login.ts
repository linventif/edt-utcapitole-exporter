import { Page } from 'puppeteer';

export async function login(
	page: Page,
	username: string,
	password: string
): Promise<void> {
	console.log('Navigating to UT Capitole schedule website...');
	await page.goto(
		// 'https://ade-production.ut-capitole.fr/direct/myplanning.jsp',
		'https://ade-production.ut-capitole.fr/direct/index.jsp',
		{
			waitUntil: 'networkidle2',
			timeout: 60000,
		}
	);

	console.log('Filling in login credentials...');

	await page.waitForSelector('#userfield', { visible: true });
	await page.type('#userfield', username);

	await page.waitForSelector('#passwordfield', { visible: true });
	await page.type('#passwordfield', password);

	await page.waitForSelector('button.btn.btn-success', { visible: true });
	await page.click('button.btn.btn-success');

	console.log('Login submitted.');
}

export async function selectDatabase(
	page: Page,
	databaseName: string
): Promise<void> {
	console.log('Waiting for database selection listbox...');
	await page.waitForSelector('[role="listbox"]', {
		visible: true,
		timeout: 30000,
	});

	console.log('Login successful - database selection interface loaded.');

	await new Promise((resolve) => setTimeout(resolve, 2000));

	console.log(`Looking for ${databaseName} option...`);

	await page.waitForFunction(
		(dbName) => {
			const spans = Array.from(
				document.querySelectorAll('span.x-editable')
			);
			return spans.some((span) => span.textContent?.includes(dbName));
		},
		{ timeout: 10000 },
		databaseName
	);

	const targetElement = await page.evaluate((dbName) => {
		const spans = Array.from(document.querySelectorAll('span.x-editable'));

		const target = spans.find(
			(span) => span.textContent?.trim() === dbName
		);
		if (target) {
			const parentDiv = target.closest('.thumb-wrap');
			if (parentDiv && parentDiv.id) {
				(parentDiv as HTMLElement).style.backgroundColor = 'red';
				(parentDiv as HTMLElement).style.border = '3px solid blue';
				return parentDiv.id;
			}
		}
		return null;
	}, databaseName);

	if (!targetElement) {
		throw new Error(`Could not find ${databaseName} option`);
	}

	console.log('Target element ID:', targetElement);

	try {
		await page.click(`#${targetElement}`);
		await new Promise((resolve) => setTimeout(resolve, 500));
		await page.click(`#${targetElement}`, { clickCount: 2 });
		console.log('Double-clicked target element with Puppeteer');
	} catch (clickError) {
		console.log('Puppeteer click failed, trying fallback:', clickError);

		await page.evaluate((elementId) => {
			const element = document.getElementById(elementId);
			if (element) {
				element.click();
				const dblClickEvent = new MouseEvent('dblclick', {
					bubbles: true,
					cancelable: true,
					view: window,
				});
				element.dispatchEvent(dblClickEvent);
			}
		}, targetElement);
	}

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const isOnSchedulePage = await page.evaluate(() => {
		return document.querySelector('.x-tree3-node-text') !== null;
	});

	if (!isOnSchedulePage) {
		console.log('Trying Open button...');
		const openClicked = await page.evaluate(() => {
			const buttons = Array.from(document.querySelectorAll('button'));
			const openButton = buttons.find(
				(btn) =>
					btn.textContent?.trim().toLowerCase().includes('open') ||
					btn.textContent?.trim().toLowerCase().includes('ouvrir')
			);
			if (openButton) {
				(openButton as HTMLElement).click();
				return true;
			}
			return false;
		});

		if (openClicked) {
			console.log('Clicked Open button');
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}

	console.log('Database selection completed.');
}
