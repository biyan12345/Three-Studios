<script lang="ts">
	import { fly } from 'svelte/transition';

	type CorrectionOption = { value: string; label: string };

	export let modeLabel: string;
	export let source: string;
	export let target: string;
	export let amount: number;
	export let sourceOptions: CorrectionOption[];
	export let targetOptions: CorrectionOption[];
	export let availableAmount: number;
	export let unitLabel = 'Coins';
	export let onClose: () => void;
	export let onTransfer: () => void;
	export let onSourceChange: (value: string) => void;
	export let onTargetChange: (value: string) => void;
	export let onAmountChange: (value: number) => void;
</script>

<div class="absolute inset-0 z-[57] grid place-items-center bg-black/60 px-6 py-8">
	<div transition:fly={{ y: 18, duration: 180 }} class="glass w-full max-w-[520px] rounded-[18px] border border-white/10 p-5">
		<div class="flex items-start justify-between gap-3">
			<div><h2 class="text-[20px] font-semibold text-slate-100">Score Correction</h2><p class="mt-1 text-[12px] leading-5 text-slate-400">Adjust the live totals for {modeLabel}.</p></div>
			<button type="button" class="text-slate-400 transition hover:text-white" on:click={onClose} aria-label="Close score correction dialog"><svg viewBox="0 0 16 16" class="h-5 w-5 fill-none stroke-current stroke-[1.6]"><path d="m4 4 8 8" /><path d="M12 4 4 12" /></svg></button>
		</div>
		<div class="mt-4 flex flex-col gap-2">
			<label class="rounded-[10px] bg-black/20 px-3 py-2"><span class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Move From</span><select value={source} on:change={(event) => onSourceChange(event.currentTarget.value)} class="studio-select mt-1 w-full text-[13px] outline-none">{#each sourceOptions as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
			<label class="rounded-[10px] bg-black/20 px-3 py-2"><span class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Move To</span><select value={target} on:change={(event) => onTargetChange(event.currentTarget.value)} class="studio-select mt-1 w-full text-[13px] outline-none">{#each targetOptions as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
			<label class="rounded-[10px] bg-black/20 px-3 py-2"><span class="text-[10px] uppercase tracking-[0.14em] text-slate-500">{unitLabel}</span><input value={amount} on:input={(event) => onAmountChange(event.currentTarget.valueAsNumber)} type="number" min="1" class="mt-1 w-full bg-transparent text-[13px] text-slate-100 outline-none" /></label>
			<div class="rounded-[10px] bg-black/20 px-3 py-2"><div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Available</div><div class="mt-1 flex items-center justify-between gap-3"><div class="text-[13px] text-slate-300">{availableAmount.toLocaleString()}</div><button type="button" class="rounded-[10px] border border-white/8 px-3 py-2 text-[12px] text-slate-100 transition hover:bg-white/[0.06]" on:click={onTransfer}>Move {unitLabel}</button></div></div>
		</div>
	</div>
</div>
