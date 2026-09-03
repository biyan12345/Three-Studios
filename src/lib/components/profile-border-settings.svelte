<script lang="ts">
    import { browser } from "$app/environment";
    import { createEventDispatcher } from "svelte";
    import type { StudioCast } from "$lib/app-types";

    type Layout = "horizontal" | "vertical";

    type ProfileFrame = {
        id: string;
        name: string;
        image: string;
        primaryColor: string;
    };

    type ProfileSettings = {
        castName: string;
        label: string;
        text: string;
        profileImage: string;
        borderImage: string;
        layout: Layout;
    };

    const dispatch = createEventDispatcher<{
        close: void;
    }>();

    export let casts: StudioCast[] = [];

    const profileFrames: ProfileFrame[] = [
        {
            id: "frame-1",
            name: "Frame 01",
            image: "/profile-border/t3-1.png",
            primaryColor: "#d92f3f", // blood red
        },
        {
            id: "frame-2",
            name: "Frame 02",
            image: "/profile-border/t3-2.png",
            primaryColor: "#8fca3d", // parrot green
        },
        {
            id: "frame-3",
            name: "Frame 03",
            image: "/profile-border/t3-3.png",
            primaryColor: "#d92f3f", // blood red
        },
        {
            id: "frame-4",
            name: "Frame 04",
            image: "/profile-border/t3-4.png",
            primaryColor: "#f2a9bd", // baby pink
        },
        {
            id: "frame-5",
            name: "Frame 05",
            image: "/profile-border/t3-5.png",
            primaryColor: "#f2a9bd", // baby pink
        },
        {
            id: "frame-6",
            name: "Frame 06",
            image: "/profile-border/t3-6.png",
            primaryColor: "#b99a55", // dull golden
        },
        {
            id: "frame-7",
            name: "Frame 07",
            image: "/profile-border/t3-7.png",
            primaryColor: "#8fca3d", // parrot green
        },
        {
            id: "frame-8",
            name: "Frame 08",
            image: "/profile-border/t3-8.png",
            primaryColor: "#55b9e8", // sky blue
        },
        {
            id: "frame-9",
            name: "Frame 09",
            image: "/profile-border/t3-9.png",
            primaryColor: "#f2a9bd", // baby pink
        },
        {
            id: "frame-10",
            name: "Frame 10",
            image: "/profile-border/t3-10.png",
            primaryColor: "#8fca3d", // parrot green
        },
        {
            id: "frame-11",
            name: "Frame 11",
            image: "/profile-border/t3-11.png",
            primaryColor: "#55b9e8", // sky blue
        },
        {
            id: "frame-12",
            name: "Frame 12",
            image: "/profile-border/t3-12.png",
            primaryColor: "#b99a55", // dull golden
        },
    ];

    const PROFILE_STORAGE_KEY = "streamplay-cast-profile-settings";

    const MAX_UPLOAD_SIZE = 2 * 1024 * 1024;
    const MAX_IMAGE_WIDTH = 512;
    const MAX_IMAGE_HEIGHT = 512;
    const MAX_STORED_IMAGE_BYTES = 450 * 1024;
    const OUTPUT_QUALITY = 0.82;

    let selectedCastName = "";
    let label = "";
    let text = "";
    let profileImage = "";

    let selectedLayout: Layout = "horizontal";
    let selectedFrame: ProfileFrame = profileFrames[0];

    let framePickerOpen = false;
    let imageUploadError = "";
    let imageUploading = false;

    let profileImageInput: HTMLInputElement;

    let settingsCache: Record<string, ProfileSettings> = {};
    let initialized = false;

    function getCastName(cast: StudioCast): string {
        const candidate = cast as StudioCast & {
            name?: string;
            displayName?: string;
            nickname?: string;
            username?: string;
        };

        return (
            candidate.name?.trim() ||
            candidate.displayName?.trim() ||
            candidate.nickname?.trim() ||
            candidate.username?.trim() ||
            "Cast"
        );
    }

    function getCastUsername(cast: StudioCast): string {
        const candidate = cast as StudioCast & {
            username?: string;
        };

        return candidate.username?.trim() || "";
    }

    function normalizeCastName(value: string): string {
        return value.trim().toLowerCase();
    }

    function getCastByName(name: string): StudioCast | null {
        const normalized = normalizeCastName(name);

        return (
            casts.find(
                (cast) => normalizeCastName(getCastName(cast)) === normalized,
            ) ?? null
        );
    }

    function readSettings(): Record<string, ProfileSettings> {
        if (!browser) {
            return {};
        }

        try {
            const raw = localStorage.getItem(PROFILE_STORAGE_KEY);

            if (!raw) {
                return {};
            }

            const parsed = JSON.parse(raw);

            if (!parsed || typeof parsed !== "object") {
                return {};
            }

            return parsed as Record<string, ProfileSettings>;
        } catch {
            return {};
        }
    }

    function writeSettings(): void {
        if (!browser) {
            return;
        }

        try {
            localStorage.setItem(
                PROFILE_STORAGE_KEY,
                JSON.stringify(settingsCache),
            );
        } catch {
            // Keep the in-memory state available if browser storage is full.
        }
    }

    function getDefaultSettings(castName: string): ProfileSettings {
        return {
            castName,
            label: castName,
            text: "",
            profileImage: "",
            borderImage: profileFrames[0].image,
            layout: "horizontal",
        };
    }

    function createSettingsForCast(castName: string): ProfileSettings {
        const normalized = normalizeCastName(castName);
        const stored = settingsCache[normalized];

        if (!stored) {
            const defaults = getDefaultSettings(castName);
            settingsCache[normalized] = defaults;
            return { ...defaults };
        }

        const normalizedStored: ProfileSettings = {
            castName,
            label: stored.label?.trim() || castName,
            text: stored.text?.trim() || "",
            profileImage: stored.profileImage || "",
            borderImage: stored.borderImage || profileFrames[0].image,
            layout: stored.layout === "vertical" ? "vertical" : "horizontal",
        };

        settingsCache[normalized] = normalizedStored;

        return { ...normalizedStored };
    }

    function saveCurrentSettings(): void {
        if (!selectedCastName) {
            return;
        }

        const normalized = normalizeCastName(selectedCastName);

        settingsCache[normalized] = {
            castName: selectedCastName,
            label: label.trim() || selectedCastName,
            text: text.trim(),
            profileImage,
            borderImage: selectedFrame?.image || profileFrames[0].image,
            layout: selectedLayout,
        };

        writeSettings();
    }

    function loadCastSettings(castName: string): void {
        if (!castName) {
            return;
        }

        const settings = createSettingsForCast(castName);

        selectedCastName = castName;
        label = settings.label || castName;
        text = settings.text || "";
        profileImage = settings.profileImage || "";

        selectedLayout =
            settings.layout === "vertical" ? "vertical" : "horizontal";

        selectedFrame =
            profileFrames.find(
                (frame) => frame.image === settings.borderImage,
            ) ?? profileFrames[0];

        settingsCache[normalizeCastName(castName)] = {
            ...settings,
            castName,
            label: label.trim() || castName,
            text: text.trim(),
            profileImage,
            borderImage: selectedFrame.image,
            layout: selectedLayout,
        };

        writeSettings();
    }

    function initializeSettings(): void {
        if (!browser || initialized) {
            return;
        }

        settingsCache = readSettings();
        initialized = true;
    }

    function selectCast(cast: StudioCast): void {
        const castName = getCastName(cast);

        if (!castName) {
            return;
        }

        saveCurrentSettings();
        loadCastSettings(castName);
    }

    function openFramePicker(): void {
        framePickerOpen = true;
    }

    function closeFramePicker(): void {
        framePickerOpen = false;
    }

    function chooseFrame(frame: ProfileFrame): void {
        selectedFrame = frame;
        saveCurrentSettings();
        framePickerOpen = false;
    }

    function updateLabel(value: string): void {
        label = value.slice(0, 24);
        saveCurrentSettings();
    }

    function updateText(value: string): void {
        text = value.slice(0, 15);
        saveCurrentSettings();
    }

    function updateLayout(layout: Layout): void {
        selectedLayout = layout;
        saveCurrentSettings();
    }

    function loadImageFromFile(file: File): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(file);
            const image = new Image();

            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(image);
            };

            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Unable to read image."));
            };

            image.src = objectUrl;
        });
    }

    async function compressProfileImage(file: File): Promise<string> {
        if (!file.type.startsWith("image/")) {
            throw new Error("Please select an image file.");
        }

        if (file.size > MAX_UPLOAD_SIZE) {
            throw new Error("Image must be smaller than 2 MB.");
        }

        const image = await loadImageFromFile(file);

        let width = image.naturalWidth || image.width;
        let height = image.naturalHeight || image.height;

        if (!width || !height) {
            throw new Error("Invalid image.");
        }

        const scale = Math.min(
            1,
            MAX_IMAGE_WIDTH / width,
            MAX_IMAGE_HEIGHT / height,
        );

        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Unable to process image.");
        }

        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        let result = canvas.toDataURL("image/webp", OUTPUT_QUALITY);

        if (!result.startsWith("data:image/webp")) {
            result = canvas.toDataURL("image/jpeg", OUTPUT_QUALITY);
        }

        let approximateBytes = Math.ceil((result.length * 3) / 4);

        if (approximateBytes > MAX_STORED_IMAGE_BYTES) {
            result = canvas.toDataURL("image/jpeg", 0.68);
            approximateBytes = Math.ceil((result.length * 3) / 4);
        }

        if (approximateBytes > MAX_STORED_IMAGE_BYTES) {
            result = canvas.toDataURL("image/jpeg", 0.55);
        }

        return result;
    }

    async function handleProfileImageUpload(event: Event): Promise<void> {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];

        imageUploadError = "";

        if (!file) {
            return;
        }

        imageUploading = true;

        try {
            profileImage = await compressProfileImage(file);
            saveCurrentSettings();
        } catch (error) {
            imageUploadError =
                error instanceof Error
                    ? error.message
                    : "Unable to upload image.";
        } finally {
            imageUploading = false;
            input.value = "";
        }
    }

    function removeProfileImage(): void {
        profileImage = "";
        imageUploadError = "";
        saveCurrentSettings();
    }

    $: selectedCast = getCastByName(selectedCastName);
    $: selectedCastUsername = selectedCast ? getCastUsername(selectedCast) : "";

    $: previewLabel = label.trim() || selectedCastName;
    $: previewText = text.trim() || "LEGEND";
    $: firstLetter = previewLabel.charAt(0).toUpperCase();

    $: if (browser && casts.length > 0 && !initialized) {
        initializeSettings();
        loadCastSettings(getCastName(casts[0]));
    }
</script>

<div class="fixed inset-0 z-[60] bg-black/55 flex items-center justify-center">
    <div
        class="mx-auto flex h-fit w-full max-w-[1180px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-[#0b0e17] shadow-2xl dark:border-white/8"
    >
        <header
            class="flex h-[64px] shrink-0 items-center justify-between border-b border-white/8 px-5"
        >
            <h2 class="text-[18px] font-semibold tracking-tight text-slate-100">
                Profile Customization
            </h2>

            <button
                type="button"
                on:click={() => {
                    saveCurrentSettings();
                    dispatch("close");
                }}
                class="grid h-8 w-8 place-items-center rounded-lg border border-white/8 bg-white/[0.03] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
                aria-label="Close"
            >
                <svg
                    viewBox="0 0 16 16"
                    class="h-4 w-4 fill-none stroke-current stroke-[1.7]"
                >
                    <path d="m4 4 8 8" />
                    <path d="M12 4 4 12" />
                </svg>
            </button>
        </header>

        <div class="flex min-h-0 flex-1">
            <!-- cast sidebar -->
            <aside
                class="flex w-[190px] shrink-0 flex-col border-r border-white/8 bg-white/[0.02]"
            >
                <div class="border-b border-white/8 px-4 py-3.5">
                    <div
                        class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                    >
                        Cast
                    </div>

                    <div class="mt-1 text-[11px] text-slate-600">
                        Select a cast to customize.
                    </div>
                </div>

                <div class="min-h-0 flex-1 overflow-y-auto p-2.5">
                    {#if casts.length > 0}
                        <div class="space-y-1">
                            {#each casts as cast}
                                {@const castName = getCastName(cast)}
                                {@const castUsername = getCastUsername(cast)}
                                {@const active =
                                    normalizeCastName(selectedCastName) ===
                                    normalizeCastName(castName)}

                                <button
                                    type="button"
                                    on:click={() => selectCast(cast)}
                                    class={`group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition ${
                                        active
                                            ? "border-blue-400/25 bg-blue-500/10"
                                            : "border-transparent hover:border-white/7 hover:bg-white/[0.03]"
                                    }`}
                                >
                                    <div class="min-w-0 flex-1">
                                        <div
                                            class={`truncate text-[12px] font-semibold ${
                                                active
                                                    ? "text-white"
                                                    : "text-slate-300"
                                            }`}
                                        >
                                            {castName}
                                        </div>

                                        {#if castUsername}
                                            <div
                                                class="mt-0.5 truncate text-[10px] text-slate-600"
                                            >
                                                @{castUsername}
                                            </div>
                                        {/if}
                                    </div>

                                    {#if active}
                                        <div
                                            class="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-300"
                                        ></div>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <div
                            class="mt-8 rounded-lg border border-dashed border-white/8 px-4 py-8 text-center"
                        >
                            <div class="text-[11px] text-slate-500">
                                No casts available.
                            </div>
                        </div>
                    {/if}
                </div>
            </aside>

            <main class="min-w-0 flex-1 overflow-y-auto">
                {#if selectedCastName}
                    <div
                        class="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]"
                    >
                        <!-- settings -->
                        <section class="min-w-0 space-y-3">
                            <!-- identity -->
                            <div
                                class="rounded-xl border border-white/8 bg-white/[0.025] p-4"
                            >
                                <div class="mb-3.5">
                                    <div
                                        class="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300/70"
                                    >
                                        Identity
                                    </div>

                                    <div
                                        class="mt-1 text-[11px] text-slate-600"
                                    >
                                        Set the label and profile text.
                                    </div>
                                </div>

                                <div class="grid gap-3 sm:grid-cols-2">
                                    <label class="block">
                                        <div
                                            class="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500"
                                        >
                                            Label
                                        </div>

                                        <input
                                            value={label}
                                            on:input={(event) =>
                                                updateLabel(
                                                    (
                                                        event.currentTarget as HTMLInputElement
                                                    ).value,
                                                )}
                                            class="h-10 w-full rounded-lg border border-white/8 bg-black/20 px-3 text-[13px] font-medium text-white outline-none transition placeholder:text-slate-700 focus:border-blue-400/35 focus:bg-black/30"
                                            placeholder={selectedCastName}
                                            maxlength="24"
                                        />
                                    </label>

                                    <label class="block">
                                        <div
                                            class="mb-1.5 flex items-center justify-between"
                                        >
                                            <div
                                                class="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500"
                                            >
                                                Text
                                            </div>

                                            <div
                                                class="text-[10px] text-slate-700"
                                            >
                                                {text.length}/15
                                            </div>
                                        </div>

                                        <input
                                            value={text}
                                            on:input={(event) =>
                                                updateText(
                                                    (
                                                        event.currentTarget as HTMLInputElement
                                                    ).value,
                                                )}
                                            class="h-10 w-full rounded-lg border border-white/8 bg-black/20 px-3 text-[13px] font-semibold tracking-wide text-white outline-none transition placeholder:text-slate-700 focus:border-blue-400/35 focus:bg-black/30"
                                            placeholder="MVP • TOP 1 • LEGEND"
                                            maxlength="15"
                                        />
                                    </label>
                                </div>
                            </div>

                            <!-- Profile Frame -->
                            <div
                                class="min-w-0 rounded-xl border border-white/8 bg-white/[0.025] p-4"
                            >
                                <div class="flex items-center gap-4">
                                    <div
                                        class="flex w-[132px] shrink-0 flex-col items-center justify-center rounded-lg border border-white/6 bg-black/15 px-3 py-2"
                                    >
                                        <div
                                            class="relative h-[52px] w-[78px] overflow-hidden"
                                        >
                                            <img
                                                src={selectedFrame.image}
                                                alt={selectedFrame.name}
                                                class="absolute inset-0 h-full w-full object-contain"
                                            />
                                        </div>

                                        <div
                                            class="mt-1.5 w-full truncate text-center text-[10px] font-semibold text-slate-300"
                                        >
                                            {selectedFrame.name}
                                        </div>
                                    </div>

                                    <div class="min-w-0 flex-1">
                                        <div
                                            class="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300/70"
                                        >
                                            Profile Frame
                                        </div>

                                        <div
                                            class="mt-1 text-[11px] leading-4 text-slate-600"
                                        >
                                            Choose a frame from the library.
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        on:click={openFramePicker}
                                        class="shrink-0 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-[10px] font-semibold text-blue-100 transition hover:border-blue-400/35 hover:bg-blue-500/15"
                                    >
                                        Choose Frame
                                    </button>
                                </div>
                            </div>

                            <!-- Profile Image -->
                            <div
                                class="min-w-0 rounded-xl border border-white/8 bg-white/[0.025] p-4"
                            >
                                <div class="flex items-center gap-4">
                                    <div
                                        class="flex h-[76px] w-[132px] shrink-0 items-center justify-center rounded-lg border border-white/6 bg-black/15 px-3 py-2"
                                    >
                                        <div
                                            class="grid h-14 w-14 place-items-center overflow-hidden rounded-full border border-white/10 bg-slate-900"
                                        >
                                            {#if profileImage}
                                                <img
                                                    src={profileImage}
                                                    alt="Profile"
                                                    class="h-full w-full rounded-full object-cover"
                                                />
                                            {:else}
                                                <div
                                                    class="text-lg font-black text-slate-500"
                                                >
                                                    {firstLetter}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>

                                    <div class="min-w-0 flex-1">
                                        <div
                                            class="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300/70"
                                        >
                                            Profile Image
                                        </div>

                                        <div
                                            class="mt-1 text-[11px] leading-4 text-slate-600"
                                        >
                                            JPG, PNG or WebP · max 2 MB
                                        </div>

                                        {#if imageUploadError}
                                            <div
                                                class="mt-1 max-w-[280px] truncate text-[10px] leading-4 text-rose-200"
                                            >
                                                {imageUploadError}
                                            </div>
                                        {/if}
                                    </div>

                                    <div
                                        class="flex shrink-0 items-center gap-1.5"
                                    >
                                        <label
                                            class={`cursor-pointer rounded-lg border px-2.5 py-2 text-[10px] font-medium transition ${
                                                imageUploading
                                                    ? "cursor-wait border-white/8 bg-white/[0.02] text-slate-600"
                                                    : "border-white/8 bg-white/[0.04] text-slate-300 hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
                                            }`}
                                        >
                                            {imageUploading
                                                ? "Processing..."
                                                : "Choose Image"}

                                            <input
                                                bind:this={profileImageInput}
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp"
                                                class="hidden"
                                                disabled={imageUploading}
                                                on:change={handleProfileImageUpload}
                                            />
                                        </label>

                                        {#if profileImage}
                                            <button
                                                type="button"
                                                on:click={removeProfileImage}
                                                disabled={imageUploading}
                                                class="rounded-lg border border-rose-400/15 bg-rose-500/10 px-2.5 py-2 text-[10px] font-medium text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-50"
                                            >
                                                Remove
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            </div>

                            <!-- layout -->
                            <div
                                class="rounded-xl border border-white/8 bg-white/[0.025] p-4"
                            >
                                <div class="mb-3.5">
                                    <div
                                        class="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300/70"
                                    >
                                        Layout
                                    </div>

                                    <div
                                        class="mt-1 text-[11px] text-slate-600"
                                    >
                                        Choose how the profile appears in the
                                        overlay.
                                    </div>
                                </div>

                                <div class="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        on:click={() =>
                                            updateLayout("horizontal")}
                                        class={`rounded-lg border p-3 text-left transition ${
                                            selectedLayout === "horizontal"
                                                ? "border-blue-400/30 bg-blue-500/10"
                                                : "border-white/7 bg-white/[0.02] hover:bg-white/[0.045]"
                                        }`}
                                    >
                                        <div
                                            class="mb-2 flex h-8 items-center justify-center rounded-md border border-white/6 bg-black/20"
                                        >
                                            <div
                                                class="h-2.5 w-8 rounded-full bg-blue-400/40"
                                            ></div>
                                        </div>

                                        <div
                                            class="text-[11px] font-semibold text-white"
                                        >
                                            Horizontal
                                        </div>

                                        <div
                                            class="mt-1 text-[10px] text-slate-600"
                                        >
                                            Wide gaming banner
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        on:click={() =>
                                            updateLayout("vertical")}
                                        class={`rounded-lg border p-3 text-left transition ${
                                            selectedLayout === "vertical"
                                                ? "border-blue-400/30 bg-blue-500/10"
                                                : "border-white/7 bg-white/[0.02] hover:bg-white/[0.045]"
                                        }`}
                                    >
                                        <div
                                            class="mb-2 flex h-8 items-center justify-center rounded-md border border-white/6 bg-black/20"
                                        >
                                            <div
                                                class="h-5 w-3.5 rounded-full bg-blue-400/40"
                                            ></div>
                                        </div>

                                        <div
                                            class="text-[11px] font-semibold text-white"
                                        >
                                            Vertical
                                        </div>

                                        <div
                                            class="mt-1 text-[10px] text-slate-600"
                                        >
                                            Stacked gaming profile
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </section>

                        <!-- live preview -->
                        <section class="min-w-0 xl:sticky xl:top-4 xl:h-fit">
                            <div
                                class="overflow-hidden rounded-2xl bg-[#0a0d14] shadow-2xl ring-1 ring-white/5"
                            >
                                <!-- Header -->
                                <div
                                    class="flex items-center justify-between bg-white/[0.02] px-5 py-4"
                                >
                                    <div class="flex flex-col gap-0.5">
                                        <div
                                            class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300"
                                        >
                                            Live Preview
                                        </div>
                                        <div
                                            class="text-[10px] font-medium tracking-wide text-slate-500"
                                        >
                                            {selectedLayout === "horizontal"
                                                ? "Horizontal Overlay"
                                                : "Vertical Overlay"}
                                        </div>
                                    </div>

                                    <div
                                        class="flex items-center gap-2 rounded-sm bg-black/40 px-2.5 py-1 ring-1 ring-white/10"
                                    >
                                        <div
                                            class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                                        ></div>
                                        <span
                                            class="text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-400"
                                        >
                                            Live
                                        </span>
                                    </div>
                                </div>

                                <!-- Preview Canvas -->
                                <div
                                    class="relative flex min-h-[400px] flex-col items-center justify-center p-6"
                                >
                                    <div
                                        class="pointer-events-none absolute inset-0 opacity-[0.15] [background-image:linear-gradient(rgba(255,255,255,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.15)_1px,transparent_1px)] [background-size:32px_32px]"
                                    ></div>

                                    {#if selectedLayout === "horizontal"}
                                        <!-- Horizontal Layout -->
                                        <div
                                            class="relative z-10 flex w-full max-w-[380px] items-center gap-3"
                                        >
                                            <div
                                                class="relative h-[92px] w-[92px] shrink-0"
                                            >
                                                <img
                                                    src={selectedFrame.image}
                                                    alt=""
                                                    class="absolute inset-0 z-20 h-full w-full object-contain drop-shadow-2xl"
                                                />

                                                <div
                                                    class="absolute inset-[10px] overflow-hidden rounded-full bg-[#0a0d14]"
                                                >
                                                    {#if profileImage}
                                                        <img
                                                            src={profileImage}
                                                            alt={previewLabel}
                                                            class="h-full w-full object-cover"
                                                        />
                                                    {:else}
                                                        <div
                                                            class="grid h-full w-full place-items-center bg-gradient-to-br from-slate-800 to-black text-xl font-bold text-white"
                                                        >
                                                            {firstLetter}
                                                        </div>
                                                    {/if}
                                                </div>
                                            </div>

                                            <div
                                                class="flex flex-1 flex-col justify-center gap-1.5 pt-1"
                                            >
                                                <div
                                                    class="w-fit max-w-full rounded-full border px-2.5 py-0.5 backdrop-blur-sm"
                                                    style={`background-color: ${selectedFrame.primaryColor}25; border-color: ${selectedFrame.primaryColor}80;`}
                                                >
                                                    <span
                                                        class="block truncate text-[9px] font-bold uppercase tracking-[0.15em]"
                                                        style={`color: ${selectedFrame.primaryColor}; text-shadow: 0 0 8px ${selectedFrame.primaryColor}80;`}
                                                    >
                                                        {previewLabel}
                                                    </span>
                                                </div>

                                                <div
                                                    class="w-fit max-w-full rounded-md px-2.5 py-1"
                                                    style={`
        border-left: 3px solid ${selectedFrame.primaryColor};
        background: linear-gradient(to right, ${selectedFrame.primaryColor}B3, ${selectedFrame.primaryColor}00);
    `}
                                                >
                                                    <span
                                                        class="block truncate text-[20px] font-black uppercase tracking-wide text-white"
                                                        style="text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);"
                                                    >
                                                        {previewText}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    {:else}
                                        <!-- Vertical Layout -->
                                        <div
                                            class="relative z-10 flex flex-col items-center gap-1"
                                        >
                                            <div
                                                class="relative h-[120px] w-[120px] shrink-0"
                                            >
                                                <img
                                                    src={selectedFrame.image}
                                                    alt=""
                                                    class="absolute inset-0 z-20 h-full w-full object-contain drop-shadow-2xl"
                                                />

                                                <div
                                                    class="absolute inset-[13px] overflow-hidden rounded-full bg-[#0a0d14]"
                                                >
                                                    {#if profileImage}
                                                        <img
                                                            src={profileImage}
                                                            alt={previewLabel}
                                                            class="h-full w-full object-cover"
                                                        />
                                                    {:else}
                                                        <div
                                                            class="grid h-full w-full place-items-center bg-gradient-to-br from-slate-800 to-black text-3xl font-bold text-white"
                                                        >
                                                            {firstLetter}
                                                        </div>
                                                    {/if}
                                                </div>
                                            </div>

                                            <div
                                                class="flex w-full flex-col items-center gap-2"
                                            >
                                                <div
                                                    class="w-fit max-w-[200px] rounded-full border px-3 py-0.5 backdrop-blur-sm"
                                                    style={`background-color: ${selectedFrame.primaryColor}25; border-color: ${selectedFrame.primaryColor}80;`}
                                                >
                                                    <span
                                                        class="block truncate text-center text-[9px] font-bold uppercase tracking-[0.15em]"
                                                        style={`color: ${selectedFrame.primaryColor}; text-shadow: 0 0 8px ${selectedFrame.primaryColor}80;`}
                                                    >
                                                        {previewLabel}
                                                    </span>
                                                </div>

                                                <div
                                                    class="w-fit max-w-[280px] rounded-md px-2.5 py-1"
                                                    style={`
        border-bottom: 3px solid ${selectedFrame.primaryColor};
        background: linear-gradient(to top, ${selectedFrame.primaryColor}B3, ${selectedFrame.primaryColor}00);
    `}
                                                >
                                                    <span
                                                        class="block truncate text-center text-[22px] font-black uppercase tracking-wide text-white"
                                                        style="text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);"
                                                    >
                                                        {previewText}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    {/if}

                                    <!-- Footer Badge -->
                                    <div
                                        class="absolute bottom-4 left-0 right-0 flex justify-center"
                                    >
                                        <span
                                            class="rounded-sm bg-black/40 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400 ring-1 ring-white/10"
                                        >
                                            {selectedCastName}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                {:else}
                    <div
                        class="grid h-full min-h-[420px] place-items-center px-6"
                    >
                        <div class="text-center">
                            <div class="text-[13px] font-medium text-slate-400">
                                Select a cast
                            </div>

                            <div class="mt-1 text-[11px] text-slate-600">
                                Choose a cast from the left to customize the
                                profile.
                            </div>
                        </div>
                    </div>
                {/if}
            </main>
        </div>
    </div>

    {#if framePickerOpen}
        <div
            class="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-5 backdrop-blur-sm"
        >
            <div
                class="flex max-h-[82vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0e17] shadow-2xl"
            >
                <div
                    class="flex items-center justify-between border-b border-white/8 px-5 py-4"
                >
                    <div>
                        <div class="text-[13px] font-semibold text-white">
                            Choose Profile Frame
                        </div>

                        <div class="mt-1 text-[10px] text-slate-600">
                            Select a frame for {selectedCastName}.
                        </div>
                    </div>

                    <button
                        type="button"
                        on:click={closeFramePicker}
                        class="grid h-8 w-8 place-items-center rounded-lg border border-white/8 text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                        aria-label="Close frame picker"
                    >
                        <svg
                            viewBox="0 0 16 16"
                            class="h-4 w-4 fill-none stroke-current stroke-[1.7]"
                        >
                            <path d="m4 4 8 8" />
                            <path d="M12 4 4 12" />
                        </svg>
                    </button>
                </div>

                <div class="min-h-0 flex-1 overflow-y-auto p-4">
                    <div
                        class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
                    >
                        {#each profileFrames as frame}
                            {@const active = selectedFrame.id === frame.id}

                            <button
                                type="button"
                                on:click={() => chooseFrame(frame)}
                                class={`group relative overflow-hidden rounded-lg border p-2 transition ${
                                    active
                                        ? "border-blue-400/40 bg-blue-500/10"
                                        : "border-white/7 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]"
                                }`}
                            >
                                <div
                                    class="relative flex aspect-[1.35] items-center justify-center overflow-hidden rounded-md bg-[#080a10]"
                                >
                                    <div
                                        class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(59,130,246,.10),transparent_50%)]"
                                    ></div>

                                    <img
                                        src={frame.image}
                                        alt={frame.name}
                                        class="relative z-10 max-h-[88%] max-w-[88%] object-contain"
                                        loading="lazy"
                                    />

                                    {#if active}
                                        <div
                                            class="absolute right-2 top-2 z-20 grid h-5 w-5 place-items-center rounded-full border border-blue-200/20 bg-blue-400/90"
                                        >
                                            <svg
                                                viewBox="0 0 16 16"
                                                class="h-3 w-3 text-white"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                            >
                                                <path
                                                    d="m3.5 8 2.7 2.7 6.3-6.3"
                                                />
                                            </svg>
                                        </div>
                                    {/if}
                                </div>

                                <div
                                    class="mt-2 truncate text-left text-[10px] font-medium text-slate-400 group-hover:text-white"
                                >
                                    {frame.name}
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>
