import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		host: '127.0.0.1',
		port: 5173,
		strictPort: true,
		allowedHosts: true,
		hmr: {
			host: '127.0.0.1',
			clientPort: 5173
		}
	},
	plugins: [tailwindcss(), sveltekit()]
});
