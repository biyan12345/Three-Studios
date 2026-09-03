<script lang="ts">
	import { fly } from 'svelte/transition';

	export let uniqueId = '';
	export let onClose: () => void;
	export let onConfirm: () => void;
</script>

<div class="absolute inset-0 z-50 grid place-items-center bg-black/55 px-6 py-8">
	<div
		transition:fly={{ y: 18, duration: 180 }}
		class="glass w-full max-w-[540px] rounded-[18px] border border-white/10 p-5"
	>
		<div class="flex items-start justify-between gap-3">
			<div>
				<h2 class="text-[20px] font-semibold text-slate-100">End?</h2>
				<p class="mt-1 text-[12px] leading-5 text-slate-400">
					This will disconnect the TikTok live feed for
					{uniqueId ? ` @${uniqueId}` : ' the current profile'}.
				</p>
			</div>
			<button
				type="button"
				class="text-slate-400 transition hover:text-white"
				on:click={onClose}
				aria-label="Close end live dialog"
			>
				<svg viewBox="0 0 16 16" class="h-5 w-5 fill-none stroke-current stroke-[1.6]">
					<path d="m4 4 8 8" />
					<path d="M12 4 4 12" />
				</svg>
			</button>
		</div>
		<div class="mt-4 rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[12px] leading-5 text-slate-400">
			This disconnects the live feed, stops the current game, and ends incoming live events.
		</div>
		<div class="mt-5 flex justify-end gap-2">
			<button
				class="rounded-[12px] border border-white/8 px-4 py-2 text-[13px] text-slate-300 transition hover:bg-white/[0.05]"
				on:click={onClose}
			>
				Cancel
			</button>
			<button
				class="rounded-[12px] bg-[#fe2c55] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#ff466a]"
				on:click={onConfirm}
			>
				End
			</button>
		</div>
	</div>
</div>
