<script lang="ts">
	type ToastMessage = {
		id: string;
		message: string;
		tone: 'error' | 'info';
	};

	export let toasts: ToastMessage[];
	export let onDismiss: (id: string) => void;
</script>

{#if toasts.length > 0}
	<div class="pointer-events-none absolute right-4 top-16 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
		{#each toasts as toast (toast.id)}
			<div class={`pointer-events-auto rounded-[14px] border px-4 py-3 text-[12px] leading-5 shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl ${toast.tone === 'error' ? 'border-rose-400/20 bg-rose-500/12 text-rose-50' : 'border-white/10 bg-[#111a21]/88 text-slate-100'}`}>
				<div class="flex items-start justify-between gap-3">
					<div>{toast.message}</div>
					<button type="button" class="shrink-0 text-white/55 transition hover:text-white" on:click={() => onDismiss(toast.id)} aria-label="Dismiss toast">
						<svg viewBox="0 0 16 16" class="h-4 w-4 fill-none stroke-current stroke-[1.6]">
							<path d="m4 4 8 8" />
							<path d="M12 4 4 12" />
						</svg>
					</button>
				</div>
			</div>
		{/each}
	</div>
{/if}
