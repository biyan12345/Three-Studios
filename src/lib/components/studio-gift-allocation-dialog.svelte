<script lang="ts">
	import { fly } from 'svelte/transition';

	export let giftLabel: string;
	export let source: string;
	export let castName: string;
	export let castNames: string[];
	export let availableAmount: number;
	export let transferAmount: number;
	export let moving = false;
	export let onClose: () => void;
	export let onConfirm: () => void;
</script>

<div class="absolute inset-0 z-[60] grid place-items-center bg-black/65 px-6 py-8">
	<div transition:fly={{ y: 12, duration: 150 }} class="glass w-full max-w-[420px] rounded-[18px] border border-white/10 p-5">
		<div class="flex items-start justify-between gap-3">
			<div><h2 class="text-[18px] font-semibold text-slate-100">{source === 'unallocated' ? 'Allocate Gift' : 'Move Gift Allocation'}</h2><p class="mt-1 text-[12px] text-slate-400">Move coins from {giftLabel} to a cast.</p></div>
			<button type="button" class="text-slate-400 transition hover:text-white" on:click={onClose} aria-label="Close gift allocation"><svg viewBox="0 0 16 16" class="h-5 w-5 fill-none stroke-current stroke-[1.6]"><path d="m4 4 8 8" /><path d="M12 4 4 12" /></svg></button>
		</div>
		<div class="mt-4 rounded-[10px] bg-black/20 px-3 py-2.5"><div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Move From</div><div class="mt-1 text-[13px] text-slate-100">{source === 'unallocated' ? 'Unallocated Pool' : source}</div><div class="mt-1 text-[11px] text-amber-200">Available: {availableAmount.toLocaleString()} coins</div></div>
		<label class="mt-2 block rounded-[10px] bg-black/20 px-3 py-2.5"><span class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Move To</span><select bind:value={castName} class="studio-select mt-1 w-full text-[13px] outline-none">{#each castNames as option}{#if option !== source}<option value={option}>{option}</option>{/if}{/each}</select></label>
		<div class="mt-2 rounded-[10px] bg-black/20 px-3 py-2.5"><div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Full Gift Value</div><div class="mt-1 text-[13px] font-medium text-slate-100">{transferAmount.toLocaleString()} coins</div></div>
		<button type="button" class="mt-3 w-full rounded-[10px] bg-amber-300/15 px-3 py-2.5 text-[12px] font-medium text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50" on:click={onConfirm} disabled={moving || transferAmount <= 0 || availableAmount < transferAmount}>{moving ? 'Moving...' : source === 'unallocated' ? 'Allocate Full Gift' : 'Move Full Gift'}</button>
		<button type="button" class="mt-2 w-full rounded-[10px] border border-white/8 px-3 py-2 text-[12px] text-slate-300 transition hover:bg-white/[0.05]" on:click={onClose}>Cancel</button>
	</div>
</div>
