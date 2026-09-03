<script lang="ts">
	export let options: string[];
	export let selected: string[];
	export let onToggle: (castName: string, selected: boolean) => void;
</script>

<div class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3">
	<div class="flex items-center justify-between gap-3">
		<div class="text-[11px] uppercase tracking-[0.16em] text-slate-500">Cast Selection</div>
		<div class="rounded-full border border-white/8 px-2 py-0.5 text-[10px] text-slate-300">{selected.length} selected</div>
	</div>
	<div class="mt-3 grid max-h-[180px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
		{#if options.length === 0}
			<div class="col-span-full rounded-[12px] border border-dashed border-white/10 bg-black/20 px-3 py-3 text-[12px] text-slate-500">No casts available yet.</div>
		{:else}
			{#each options as castName}
				<label class="flex min-w-0 cursor-pointer items-center gap-2 rounded-[10px] border border-white/8 bg-black/20 px-3 py-2 text-[12px] text-slate-200">
					<input type="checkbox" class="h-4 w-4 rounded border-white/12 bg-black/30 text-cyan-300" checked={selected.includes(castName)} on:change={(event) => onToggle(castName, event.currentTarget.checked)} />
					<span class="truncate">{castName}</span>
				</label>
			{/each}
		{/if}
	</div>
</div>
