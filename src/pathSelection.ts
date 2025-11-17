import { Page } from 'puppeteer';

export async function navigateTreePath(
	page: Page,
	pathNodes: string[]
): Promise<void> {
	console.log(`Starting tree navigation for path: ${pathNodes.join(' > ')}`);

	// Wait for tree to be ready
	console.log('Waiting for tree structure to load...');
	await page.waitForSelector('span.x-tree3-node-text', {
		visible: true,
		timeout: 10000,
	});
	console.log('Tree structure loaded');

	// Initial wait for stability
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Debug: List all available nodes at start
	const initialNodes = await page.evaluate(() => {
		const treeTexts = Array.from(
			document.querySelectorAll('span.x-tree3-node-text')
		);
		return treeTexts.map((t) => t.textContent?.trim());
	});
	console.log('Initial available nodes:', initialNodes);

	for (let i = 0; i < pathNodes.length; i++) {
		const nodeName = pathNodes[i];
		const isLastNode = i === pathNodes.length - 1;

		console.log(`\nStep ${i + 1}: Processing node "${nodeName}"...`);

		// Debug: List current nodes before searching
		const currentNodes = await page.evaluate(() => {
			const treeTexts = Array.from(
				document.querySelectorAll('span.x-tree3-node-text')
			);
			return treeTexts.map((t) => t.textContent?.trim());
		});
		console.log(
			`Currently visible nodes (${currentNodes.length}):`,
			currentNodes
		);

		// Wait for the specific node to be available
		console.log(`Waiting for node "${nodeName}" to appear...`);
		try {
			await page.waitForFunction(
				(name) => {
					const treeTexts = Array.from(
						document.querySelectorAll('span.x-tree3-node-text')
					);
					const found = treeTexts.some(
						(span) => span.textContent?.trim() === name
					);
					console.log(`Looking for "${name}", found: ${found}`);
					return found;
				},
				{ timeout: 15000 },
				nodeName
			);
			console.log(`✓ Node "${nodeName}" found and ready`);
		} catch (error) {
			console.error(`✗ Timeout waiting for node "${nodeName}"`);
			const nodesAfterTimeout = await page.evaluate(() => {
				const treeTexts = Array.from(
					document.querySelectorAll('span.x-tree3-node-text')
				);
				return treeTexts.map((t) => t.textContent?.trim());
			});
			console.error('Nodes after timeout:', nodesAfterTimeout);
			throw new Error(
				`Timeout waiting for tree node: ${nodeName}. Available nodes: ${nodesAfterTimeout.join(
					', '
				)}`
			);
		}

		// Find the node by text content
		const nodeFound = await page.evaluate((name) => {
			const treeTexts = Array.from(
				document.querySelectorAll('span.x-tree3-node-text')
			);

			console.log(
				`Searching for "${name}" among ${treeTexts.length} nodes`
			);
			console.log(
				'All node texts:',
				treeTexts.map((t) => `"${t.textContent?.trim()}"`)
			);

			const targetNode = treeTexts.find((span) => {
				const trimmedText = span.textContent?.trim();
				const matches = trimmedText === name;
				console.log(
					`Comparing "${trimmedText}" === "${name}": ${matches}`
				);
				return matches;
			});

			if (!targetNode) {
				console.error(`Node "${name}" not found in DOM`);
				console.error(
					'Checked nodes:',
					treeTexts.map((t) => t.textContent?.trim())
				);
				return null;
			}

			console.log(
				`Found target node with text: "${targetNode.textContent?.trim()}"`
			);

			// Get the parent cell - try multiple possible parent selectors
			let parentCell = targetNode.closest('td.x-tree3-node-ct');
			if (!parentCell) {
				console.log(
					'td.x-tree3-node-ct not found, trying td.x-grid3-td-NAME'
				);
				parentCell = targetNode.closest('td.x-grid3-td-NAME');
			}
			if (!parentCell) {
				console.log('td.x-grid3-td-NAME not found, trying any td');
				parentCell = targetNode.closest('td');
			}
			if (!parentCell) {
				console.error('No parent cell found with any selector');
				return null;
			}

			console.log(
				`Parent cell ID: ${parentCell.id}, classes: ${parentCell.className}`
			);

			// Find the tree node container for the joint image
			const treeNode = targetNode.closest('.x-tree3-node');
			if (!treeNode) {
				console.error('Tree node container not found');
				return null;
			}

			// Check if node is already expanded
			const joint = treeNode.querySelector('img.x-tree3-node-joint');
			const isExpanded = joint
				? (joint as HTMLImageElement).src?.includes('minus') ||
				  (joint as HTMLImageElement).src?.includes('elbow-end')
				: false;

			console.log(
				`Node expanded state: ${isExpanded}, joint src: ${
					joint ? (joint as HTMLImageElement).src : 'no joint'
				}`
			);

			return {
				cellId: parentCell.id,
				text: name,
				isExpanded: isExpanded || false,
			};
		}, nodeName);

		if (!nodeFound) {
			// Debug: list all available nodes
			const availableNodes = await page.evaluate(() => {
				const treeTexts = Array.from(
					document.querySelectorAll('span.x-tree3-node-text')
				);
				return treeTexts.map((t) => t.textContent?.trim());
			});
			console.error('✗ Node not found in evaluation');
			console.error('Available nodes:', availableNodes);
			throw new Error(
				`Could not find tree node: ${nodeName}. Available: ${availableNodes.join(
					', '
				)}`
			);
		}

		console.log(
			`✓ Found node "${nodeName}" with cell ID: ${nodeFound.cellId} (expanded: ${nodeFound.isExpanded})`
		);

		if (isLastNode) {
			// Last node: just click to select
			console.log(`Clicking final node "${nodeName}"...`);
			try {
				await page.click(`#${nodeFound.cellId}`);
				console.log(`✓ Successfully selected "${nodeName}"`);
			} catch (error) {
				console.log('Direct click failed, trying fallback:', error);
				await page.evaluate((cellId) => {
					const cell = document.getElementById(cellId);
					if (cell) {
						console.log('Fallback: clicking cell via evaluate');
						(cell as HTMLElement).click();
					}
				}, nodeFound.cellId);
				console.log(`✓ Fallback click successful for "${nodeName}"`);
			}
		} else {
			// Intermediate node: click the expand icon if not already expanded
			if (nodeFound.isExpanded) {
				console.log(
					`✓ Node "${nodeName}" is already expanded, skipping...`
				);
			} else {
				console.log(`Expanding node "${nodeName}"...`);
				try {
					const expanded = await page.evaluate((cellId) => {
						const cell = document.getElementById(cellId);
						if (cell) {
							const jointImg = cell.querySelector(
								'img.x-tree3-node-joint'
							);
							if (jointImg) {
								console.log(
									'Clicking joint image to expand, src:',
									(jointImg as HTMLImageElement).src
								);
								(jointImg as HTMLElement).click();
								return true;
							} else {
								console.log('No joint image found in cell');
							}
						} else {
							console.error('Cell not found by ID:', cellId);
						}
						return false;
					}, nodeFound.cellId);

					if (expanded) {
						console.log(`✓ Successfully expanded "${nodeName}"`);
					} else {
						console.log(
							`No joint found, clicking cell directly for "${nodeName}"`
						);
						await page.click(`#${nodeFound.cellId}`);
						console.log(
							`✓ Clicked cell directly for "${nodeName}"`
						);
					}
				} catch (error) {
					console.log('Expand failed, trying fallback:', error);
					await page.click(`#${nodeFound.cellId}`);
					console.log(
						`✓ Fallback expand successful for "${nodeName}"`
					);
				}

				// Wait for expansion to complete
				console.log('Waiting for child nodes to load...');
				await new Promise((resolve) => setTimeout(resolve, 3000));

				// Debug: List nodes after expansion
				const nodesAfterExpand = await page.evaluate(() => {
					const treeTexts = Array.from(
						document.querySelectorAll('span.x-tree3-node-text')
					);
					return treeTexts.map((t) => t.textContent?.trim());
				});
				console.log(
					`Nodes after expansion (${nodesAfterExpand.length}):`,
					nodesAfterExpand
				);
			}
		}
	}

	console.log('\n✅ Tree navigation completed successfully!');
	await new Promise((resolve) => setTimeout(resolve, 2000));
}
