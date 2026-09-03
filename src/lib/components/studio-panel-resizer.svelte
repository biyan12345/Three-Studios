<script lang="ts">
	import { onDestroy } from 'svelte';

	export let label = 'Resize panel';
	export let title = label;
	export let keyboardStep = 16;
	export let onResize: (horizontalDelta: number) => void = () => {};

	let lastClientX = 0;
	let resizing = false;

	function startResize(event: PointerEvent) {
		event.preventDefault();
		lastClientX = event.clientX;
		resizing = true;
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		window.addEventListener('pointermove', resize);
		window.addEventListener('pointerup', stopResize);
		window.addEventListener('pointercancel', stopResize);
	}

	function resize(event: PointerEvent) {
		if (!resizing) return;
		const delta = event.clientX - lastClientX;
		lastClientX = event.clientX;
		if (delta !== 0) onResize(delta);
	}

	function stopResize() {
		resizing = false;
		window.removeEventListener('pointermove', resize);
		window.removeEventListener('pointerup', stopResize);
		window.removeEventListener('pointercancel', stopResize);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}

	function resizeWithKeyboard(event: KeyboardEvent) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		onResize(event.key === 'ArrowLeft' ? -keyboardStep : keyboardStep);
	}

	onDestroy(() => {
		if (typeof document === 'undefined') return;
		stopResize();
	});
</script>

<button
	type="button"
	class="group relative min-h-0 touch-none cursor-col-resize rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/60"
	on:pointerdown={startResize}
	on:keydown={resizeWithKeyboard}
	aria-label={label}
	{title}
>
	<span class="absolute inset-y-3 left-1/2 w-1 -translate-x-1/2 rounded-full bg-white/10 transition group-hover:bg-cyan-300/55 group-active:bg-cyan-300/75"></span>
</button>
