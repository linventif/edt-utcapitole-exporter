import { z } from 'zod';

// Define the schema for the .env file
export const envSchema = z.object({
	CHROMIUM_PATH: z.string().default('/usr/bin/chromium-browser'),
	START_MAXIMIZED: z
		.string()
		.transform((val) => val === 'true')
		.optional(),
	AUTH_USERNAME: z.string().nonempty('AUTH_USERNAME is required'),
	AUTH_PASSWORD: z.string().nonempty('AUTH_PASSWORD is required'),
	DOWNLOAD_PATH: z.string().default('/app/downloads'),
	DEBUG_MODE: z
		.string()
		.optional()
		.transform((val) => val === 'true')
		.default(() => false),
});

// Validate the environment variables
export function validateEnv(env: NodeJS.ProcessEnv) {
	const parsed = envSchema.safeParse(env);
	if (!parsed.success) {
		console.error('Invalid environment variables:', parsed.error.format());
		process.exit(1); // Exit the process if validation fails
	}
	return parsed.data;
}
