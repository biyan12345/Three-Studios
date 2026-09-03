<script lang="ts">
	import { goto } from '$app/navigation';
	import { loginToAuthSession } from '$lib/client/studio-api';

	export let data: {
		reason: string;
		next: string;
	};

	const reasonLabels: Record<string, string> = {
		'auth-required': 'Sign in to continue.',
		'session-ended': 'Your session ended. Sign in again.',
		'auth-unavailable': 'Authentication service is unavailable.'
	};

	let identifier = '';
	let password = '';
	let statusMessage = reasonLabels[data.reason] || '';
	let submitting = false;

	async function handleSubmit() {
		if (submitting) {
			return;
		}

		statusMessage = '';
		submitting = true;

		try {
			await loginToAuthSession(identifier, password);
			await goto(data.next || '/', {
				replaceState: true
			});
		} catch (error) {
			statusMessage =
				error instanceof Error ? error.message : 'Authentication failed.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Streamplay Studio Login</title>
</svelte:head>

<div class="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_30%),linear-gradient(180deg,#041017,#02070b)] px-5 text-white">
	<form
		class="w-full max-w-[420px] rounded-[24px] border border-white/8 bg-[#081118]/95 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.38)]"
		on:submit|preventDefault={handleSubmit}
	>
		<h1 class="text-[28px] font-semibold text-slate-50">Streamplay Studio</h1>

		<div
			class={`mt-4 min-h-[52px] rounded-[16px] border px-4 py-3 text-[13px] leading-5 ${
				statusMessage
					? 'border-rose-300/18 bg-rose-500/10 text-rose-100'
					: 'border-transparent bg-transparent text-transparent'
			}`}
		>
			{statusMessage || ' '}
		</div>

		<div class="mt-4 space-y-4">
			<label class="block">
				<div class="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">ID</div>
				<input
					bind:value={identifier}
					type="text"
					autocomplete="username"
					class="w-full rounded-[16px] border border-white/8 bg-white/[0.04] px-4 py-3 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-200/28 focus:bg-white/[0.06]"
					
				/>
			</label>

			<label class="block">
				<div class="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">Password</div>
				<input
					bind:value={password}
					type="password"
					autocomplete="current-password"
					class="w-full rounded-[16px] border border-white/8 bg-white/[0.04] px-4 py-3 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-200/28 focus:bg-white/[0.06]"
					
				/>
			</label>
		</div>

		<button
			type="submit"
			class="mt-5 inline-flex w-full items-center justify-center rounded-[16px] bg-[#fe2c55] px-4 py-3 text-[14px] font-semibold text-white transition hover:bg-[#ff456a] disabled:cursor-not-allowed disabled:bg-[#7e2335] disabled:text-white/70"
			disabled={submitting}
		>
			{submitting ? 'Signing In...' : 'Sign In'}
		</button>
	</form>
</div>
