<script lang="ts">
	import { fly } from "svelte/transition";
	import {
		normalizeGiftSearchValue,
		type GiftCatalogEntry,
	} from "$lib/gift-catalog";

	export let gifts: GiftCatalogEntry[];
	export let castName: string;
	export let slotIndex = 0;
	export let showSlot = false;
	export let unavailableGiftIds: string[] = [];
	export let onClose: () => void;
	export let onSelect: (giftId: string) => void;

	let search = "";

	$: query = normalizeGiftSearchValue(search);

	$: unavailableSet = new Set(
		unavailableGiftIds.map((giftId) => String(giftId)),
	);

	$: filteredGifts = query
		? gifts.filter((gift) =>
				[
					normalizeGiftSearchValue(gift.name),
					normalizeGiftSearchValue(gift.giftId),
					String(gift.points),
				].some((value) => value.includes(query)),
			)
		: gifts;

	function isGiftUnavailable(gift: GiftCatalogEntry) {
		return unavailableSet.has(String(gift.giftId));
	}

	function selectGift(gift: GiftCatalogEntry) {
		if (isGiftUnavailable(gift)) {
			return;
		}

		onSelect(gift.giftId);
	}
</script>

<div
	class="absolute inset-0 z-[70] grid place-items-center bg-black/65 px-6 py-8"
>
	<div
		transition:fly={{ y: 18, duration: 180 }}
		class="glass flex h-full max-h-[760px] w-full max-w-[960px] flex-col rounded-[18px] border border-white/10 p-5"
	>
		<div class="flex items-center justify-between gap-3">
			<div>
				<h2 class="text-[20px] font-semibold text-slate-100">
					Select Gift
				</h2>

				<p class="mt-1 text-[12px] text-slate-500">
					Assign a TikTok gift to {castName || "this cast"}
					{showSlot ? ` (Gift ${slotIndex + 1})` : ""}.
				</p>
			</div>

			<button
				class="text-slate-400 transition hover:text-white"
				on:click={onClose}
				type="button"
				aria-label="Close gift selector"
			>
				<svg
					viewBox="0 0 16 16"
					class="h-5 w-5 fill-none stroke-current stroke-[1.6]"
				>
					<path d="m4 4 8 8" />
					<path d="M12 4 4 12" />
				</svg>
			</button>
		</div>

		<label
			class="mt-4 block rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
		>
			<span
				class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
			>
				Search Gift
			</span>

			<input
				bind:value={search}
				type="search"
				class="mt-2 w-full bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-600"
				placeholder="Search by gift name or ID"
			/>
		</label>

		<div class="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
			{#if filteredGifts.length > 0}
				<div
					class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
				>
					{#each filteredGifts as gift}
						{@const unavailable = isGiftUnavailable(gift)}

						<button
							class={`flex items-center gap-3 rounded-[12px] border px-3 py-3 text-left transition ${
								unavailable
									? "cursor-not-allowed border-white/5 bg-white/[0.015] opacity-35"
									: "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
							}`}
							on:click={() => selectGift(gift)}
							disabled={unavailable}
							type="button"
							aria-disabled={unavailable}
						>
							<div
								class="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-black/20"
							>
								{#if gift.giftImageUrl}
									<img
										src={gift.giftImageUrl}
										alt={gift.name}
										class="h-10 w-10 object-contain"
									/>
								{:else}
									<span class="text-lg">🎁</span>
								{/if}
							</div>

							<div class="min-w-0 flex-1">
								<div
									class="truncate text-[13px] font-medium text-slate-100"
								>
									{gift.name}
								</div>

								<div class="mt-0.5 text-[11px] text-slate-500">
									ID {gift.giftId} - {gift.points} points
								</div>

								{#if unavailable}
									<div
										class="mt-1 text-[10px] font-medium text-rose-300/80"
									>
										Already assigned
									</div>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{:else}
				<div
					class="rounded-[12px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-[13px] text-slate-400"
				>
					No gifts matched "{search.trim()}".
				</div>
			{/if}
		</div>
	</div>
</div>
