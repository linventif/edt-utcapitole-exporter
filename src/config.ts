import type { CalendarPath } from './types';

export const CALENDAR_PATHS: CalendarPath[] = [
	// {
	// 	name: 'M1_MIAGE',
	// 	path: ['Trainees', 'UFR Informatique', 'M1 MIAGE'],
	// },
	{
		name: 'IMMFA1TD01',
		path: [
			'Trainees',
			'UFR Informatique',
			'M1 MIAGE',
			'IMMFA1TD',
			'IMMFA1TD01',
		],
	},
	{
		name: 'IMMFA1CM01',
		path: [
			'Trainees',
			'UFR Informatique',
			'M1 MIAGE',
			'IMMFA1CM',
			'IMMFA1CM01',
		],
	},
];

export const DATABASE_NAME = 'ADEPROD_2025-2026';

// Calendar merge configuration for the server
// Maps a virtual calendar name to an array of source calendars to merge
export const CALENDAR_MERGES: Record<string, string[]> = {
	GroupeIMP: ['IMMFA1TD01', 'IMMFA1CM01'],
	// Add more merged calendars as needed:
	// AllM1MIAGE: ['M1_MIAGE', 'IMMFA1TD01', 'IMMFA1CM01'],
};
