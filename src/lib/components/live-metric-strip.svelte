<script lang="ts">
	import type { LiveMetricRow } from '$lib/app-types';

	export let metrics: LiveMetricRow[] = [];
</script>

{#if metrics.length > 0}
	<div class="flex flex-wrap gap-1.5" aria-label="LIVE statistics">
		{#each metrics as item}
			<span class="flex-1 inline-flex items-center gap-1.5 rounded-[8px] bg-white/[0.05] px-2 py-1 text-[10px] text-slate-200" title={`${item.label}: ${item.value}`} aria-label={`${item.label}: ${item.value}`}>
				<span class="text-slate-400">
					{#if item.key === 'diamonds'}
						<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-current" aria-hidden="true"><path d="M4.2 2.5h7.6l3 3.4L8 13.5.9 5.9l3.3-3.4Zm.9 1.2L2.7 6.1h10.7l-2.2-2.4H5.1Zm1.1 0L8 10.1l1.8-6.4H6.2Z" /></svg>
					{:else if item.key === 'currentViewers'}
						<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.4]" aria-hidden="true"><circle cx="5" cy="5.1" r="2.1" /><circle cx="11.2" cy="6" r="1.8" /><path d="M1.9 12.8c.5-2 1.9-3.1 3.9-3.1 2 0 3.4 1.1 4 3.1" /><path d="M9.1 12.5c.4-1.5 1.5-2.4 3-2.4 1 0 1.8.3 2.4.9" /></svg>
					{:else if item.key === 'totalViews'}
						<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.4]" aria-hidden="true"><path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4-6.5-4-6.5-4Z" /><circle cx="8" cy="8" r="2.1" /></svg>
					{:else if item.key === 'follows'}
						<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.4]" aria-hidden="true"><circle cx="5.1" cy="5.3" r="2.1" /><path d="M2.2 12.8c.4-2 1.7-3.1 3.7-3.1s3.3 1.1 3.8 3.1" /><path d="M11.3 3.4v5.3M8.7 6h5.2" /></svg>
					{:else}
						<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.4]" aria-hidden="true"><path d="M8 13.3 2.6 8.2a3.1 3.1 0 0 1 4.4-4.4L8 4.8l1-.9a3.1 3.1 0 1 1 4.4 4.4L8 13.3Z" /></svg>
					{/if}
				</span>
				<span class="font-semibold tabular-nums">{item.value}</span>
			</span>
		{/each}
	</div>
{/if}
