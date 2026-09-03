# Streamplay Studio

Vertical-first SvelteKit dashboard for a TikTok streaming workflow.

## Stack

- SvelteKit
- Tailwind CSS
- TypeScript
- Electron

## Run

1. Install dependencies:

```bash
npm install
```

2. Configure the backend at `https://streamplay.devkit.sh` to handle login, session checks, and license enforcement.

3. Provision backend-managed users manually. There is no public registration flow.

Store the Streamplay access policy in the backend for each user. Example shape:

```json
{
  "streamplay_login_id": "assigned-user",
  "streamplay_license_status": "ACTIVE",
  "streamplay_enabled": true,
  "streamplay_backend_api_key": "optional-backend-key",
  "streamplay_license_check_interval_seconds": 300,
  "streamplay_profiles": [
    "creator_one",
    { "id": "creator-two", "username": "creator_two", "displayName": "Creator Two" }
  ]
}
```

4. Start development:

```bash
npm run dev
```

The app is now gated by authentication. The main studio UI, local API routes, and runtime overlay state routes require a valid session before they work. TikTok-related proxy routes such as `/api/tiktok-live` and `/api/studio/launch` forward the authenticated JWT access token plus the paired refresh token to the fixed backend `https://streamplay.devkit.sh`.

## Auth Notes

- There is no public registration flow.
- Operators must sign in with a manually assigned user ID and password.
- Only TikTok usernames listed in `streamplay_profiles` are selectable in the studio.
- Streamplay Studio re-checks the active token-based session during app use.
- OBS runtime overlay access uses a signed local overlay token so browser-source rendering can work without opening the overlay publicly.

## Desktop Env

The packaged Electron app does not inherit Vite's dev-time `.env` loading.

For desktop builds, the app reads `.env` from these locations:

- the bundled app resources
- the app executable directory
- `~/Library/Application Support/streamplay studio/.env` on macOS

If you are upgrading from an older `Streamplay` or `Streamplay Studio` install, the desktop app migrates that existing data into `~/Library/Application Support/streamplay studio` on first launch so profiles and settings stay intact.

The desktop app does not need local auth env vars for login. Authentication is delegated to the backend.

## Windows Builds

Build Windows installers per architecture. Do not send an ARM64 installer to a typical x64 Windows client.

```bash
npm run desktop:dist:win
npm run desktop:dist:win:arm64
```

The generated installer filename includes the architecture, for example:

- `Streamplay Studio-Setup-2.0.0-x64.exe`
- `Streamplay Studio-Setup-2.0.0-arm64.exe`

Get LIVE Gifts
curl 'https://webcast.tiktok.com/webcast/gift/list/?WebIdLastTime=1765039692&aid=1988&app_language=en&app_name=tiktok_web&browser_language=en-US&browser_name=Mozilla&browser_online=true&browser_platform=MacIntel&browser_version=5.0%20%28Macintosh%3B%20Intel%20Mac%20OS%20X%2010_15_7%29%20AppleWebKit%2F537.36%20%28KHTML%2C%20like%20Gecko%29%20Chrome%2F149.0.0.0%20Safari%2F537.36%20Edg%2F149.0.0.0&channel=tiktok_web&cookie_enabled=true&data_collection_enabled=true&device_id=7580787727655863826&device_platform=web_pc&focus_state=true&from_page=&history_len=3&is_fullscreen=false&is_page_visible=true&os=mac&priority_region=AE&referer=https%3A%2F%2Fwww.tiktok.com%2F%40nofiltergang3%2Flive&region=AE&room_id=7669997275892026132&root_referer=https%3A%2F%2Fwww.tiktok.com%2F%40nofiltergang3%2Flive&screen_height=982&screen_width=1512&tz_name=Asia%2FDubai&user_is_login=true&verifyFp=verify_mpll3bc2_ERaTTDdi_5yze_4tSC_8nMB_O60i2k4yuKu4&webcast_language=en&X-Dynosaur=M859eHQ5BqB336HH1dXVmQmaqc1J3Izx/cn4Ma/mG6bPDRiHHbxdk2P6lEZatOEmM6rRml5rX5X2p36L4AtN8H1cTmMDdHq1hi92fbylZWTLQWfFtLRmg2BAUTKz273hLM5swV5-kwWRFJzs/wr7fDo/teB/-FTREl32uzOafjON/VcOlEL9MRIs7Eu0flR9u24TjDCe/puPiI5DPjjiOC3uXBMiPopj0CzAcrwY6h6jV9Le/1rk/ndSPmsL7MAoa/9-cZIhcM1hWCw0FVcb2cpwmSCY-wXv40O-MLdBEKrRDgi5Svs77upXuxBcnb2sOGGMyVdcKF2C1IHVcItxdPQZv-jq/KCEsE2ms8Po-u34u1Z00Q-X8kBRVDbfNkXRK-7wowe=&msToken=oqqa2KWDmSXaNL7yVMoXjJcE-9-gxNp_s83wBgInkN9H3jjbjv4R749-k09P9yfkPq9hRjZ3WNBvi19XD-6E9lm6eZedtY1nggLXmZ1x-ayvp5MpXXmEv2B-Bg_5eIEVw6ylGmj0bRewZwnwyGfYOLRMH3iqm0d8mzeyQg8oKW4=&X-Bogus=1&X-Gnarly=MJhLTHm8VwNM8MEvkx2iIPPP86CjyrcqvH9k/e-58uROQl2nrppJKu1/dJqIvBR7LuXShDj31CFWyEks2brqnpj4Fs5kt596Xyhdz3FSDw37oUjSmImFPu4g2KB82B8WmlmRBZ5lyqSNVftHrPlrosvgCsl/8Uc1ABskubHzMl/A1SDYRvMX9nJKJ836oocr/fXI72yzo5fbfKR/Zbx1sXis/HbF8NOLsS/dbjTWtl3Fu89ar9ZTce3Q0xmaFrlwffuppvqSGY0TiUrxk0p3nsLsxGWGCxJV33wteugxTiHw2s93FSpzIVq7S1Y0Fdr4eB-/q7zdo7Dy' \
  -H 'accept: */*' \
  -H 'accept-language: en-US,en;q=0.9,en-IN;q=0.8' \
  -b 'd_ticket=f22e50bfb5ed11034dee8b87dc25abc407c1f; _tt_enable_cookie=1; FPID=FPID2.2.UPK7r5wHDc79lYNeNnG6voEAavaSFfi4nw2D4718aaw%3D.1772867432; _gtmeec=e30%3D; _fbp=fb.1.1772867431837.1010871282; tt_csrf_token=E7X4aEcO-aGOau2P69M5hCloMzzxX8rCKFOI; csrfToken=TbyLqEzl-f4aKUj0N1sdBd2WrMCM9NUvmt_o; csrf_session_id=417580a32c79801801da5231db4acb10; s_v_web_id=verify_mpll3bc2_ERaTTDdi_5yze_4tSC_8nMB_O60i2k4yuKu4; _ga=GA1.1.GA1.1.GA1.1.GA1.1.GA1.1.GA1.1.872090590.1772867432; _ga_GR6VLNH8D4=GS1.1.1780588311.24.0.1780588644.0.0.1953519286; FPAU=1.2.332169538.1780823343; passport_csrf_token=2342033581ab78d4daf8ac11bb5d4ffd; passport_csrf_token_default=2342033581ab78d4daf8ac11bb5d4ffd; multi_sids=7563375637701215252%3Af4360c3495ff21fd2275094a3868487e; cmpl_token=AgQYAPOm_hfkTtK4yGy2ZDSdLfNVx3WnDr-Q32CmvOE; sid_guard=f4360c3495ff21fd2275094a3868487e%7C1781822730%7C15552000%7CTue%2C+15-Dec-2026+22%3A45%3A30+GMT; uid_tt=58ea2e3f3059014920af1c22e304fb4605bed3d2900e05504c0840b0f410d27c; uid_tt_ss=58ea2e3f3059014920af1c22e304fb4605bed3d2900e05504c0840b0f410d27c; sid_tt=f4360c3495ff21fd2275094a3868487e; sessionid=f4360c3495ff21fd2275094a3868487e; sessionid_ss=f4360c3495ff21fd2275094a3868487e; tt_session_tlb_tag=sttt%7C2%7C9DYMNJX_If0idQlKOGhIfv_________FdX33DyxJ39gG7qjtn4vVun6YhXkWqUvVghI7occHUUk%3D; sid_ucp_v1=1.0.1-KGZmNjE4MzhmNWU3YzRmNGFkNWE4YmY5ZGVhZTU4N2UxYThhMjMyYmMKIgiUiJngnsKg-2gQiurR0QYYswsgDDCwhNrHBjgHQPQHSAQQAxoCbXkiIGY0MzYwYzM0OTVmZjIxZmQyMjc1MDk0YTM4Njg0ODdlMk4KIIbOJJipZQy6Zr4OoXaioPHIFZeHrPKd4UoQzfu5E8BaEiDA7k-h0kQCDvxBYG9sOPjb1jTSy-Al1Jut4qJlOgdywhgEIgZ0aWt0b2s; ssid_ucp_v1=1.0.1-KGZmNjE4MzhmNWU3YzRmNGFkNWE4YmY5ZGVhZTU4N2UxYThhMjMyYmMKIgiUiJngnsKg-2gQiurR0QYYswsgDDCwhNrHBjgHQPQHSAQQAxoCbXkiIGY0MzYwYzM0OTVmZjIxZmQyMjc1MDk0YTM4Njg0ODdlMk4KIIbOJJipZQy6Zr4OoXaioPHIFZeHrPKd4UoQzfu5E8BaEiDA7k-h0kQCDvxBYG9sOPjb1jTSy-Al1Jut4qJlOgdywhgEIgZ0aWt0b2s; store-idc=alisg; store-country-code=in; store-country-code-src=uid; tt-target-idc=alisg; tt-target-idc-sign=cLw02R47TvWpnEdUxjLu4UmvWunTdawV0cYeDQ4aDTpUrsOq8TrKo413P5a-3GlrjsmkxTCbKPuOFa3Bt1T89-KGYtvRyHm2O0sf4-bD2DeW7ZbAB8B_-qSuST_SEst7qmcjQJqwkE00y84gsdzb0H-trwQ2NWunsCgZ7twG41w64EgXWashoKVPGVrgKjn6D4P5tPWbYuxDXZRZNhwVJV89llWKtUOH8pw4TCQBGpOzx3y2jmBlFcEIjA8Wy60_phgADiGrbFqjng530FWhi5OhitNhndkY2VmXl-p1uV6J5pVVhddkC6yaoT8S2bAc0Aq0Lr-omPkRRhri777Dgjm-vdKDqyOXsfAg5WRzAa4X6497E_Q6_6p43-JFQ6rjrG1u7x1_h-eGSvfemRc9-MhzIWt0BYxzUL_36Hwb4uLkwnkXjRC-5uKHVVZXPkMuUB3l3YOwk7wPS9jUW_Gk9cHlLVowveP3ZtOFlClGz6QRb9Ge-Zfysc6qd2R1bW1p; FPLC=ioe7mBDf19eZzXm%2F%2BKWtfh6FxzOBsEAOY6mR%2BEeiIGUQAL5OK1xbl2wlnpd2cfDu0VKMcRWtD0nWZDlhcAaLUMb%2BO8ICqaL7ZIg5C12z79glvdDUFDtM8Wu4155f3w%3D%3D; ttcsid_CQ6FR3RC77U6L0AM21H0=1785755615108::vPt1eTNfsV-YR-gXr2T5.81.1785755672957.1; ttcsid=1785755615108::5P9dXehC7jzADkhLn8gO.83.1785755672957.0::1.49848.51937::168135.20.307.703::149026.66.0; _ga_GZB380RXJX=GS2.1.s1785764498$o95$g1$t1785764498$j60$l0$h987797530; _ttp=3HPLnfRRLJTz6iOmJAOzN2nM41d; tt_chain_token=RoCMF49vtTL0WR6Si0ucyQ==; store-country-sign=MEIEDM8-jaoClfeHhQdvswQgcMWW6HsTQFZeOMYenyRW01U3ZXPovcbtfOZnZqzjCbAEEBG0JamZzq6pnfW6rqgOux8; odin_tt=1ada420611e35bb72c5fe9533d6750ab732723ddf16371b271e91650a0848197593c945f504eab652b5d4755fa14c3716580a8a55241a9f80b1576d1f1ff21f6; ttwid=1%7CAS7fQfc5Ic6G3G0l63Hra7evYbLJjicXaHw-_KSkPpo%7C1785812532%7C9cbc54e092a29fabbb42e618b024265e64bbce43926637435359c2ef79ed6096; msToken=pUhl72tpTqHrCadzQzbYpuIHVDLsdnIzB1fhlLSm_4grM4fS1Df61I6zPb7jUQvgkvXqTdorhppLC7cpnxd0la4YErSY177252UzuK78kBK2LHh8ZZ-x0CG_6gN_nWhFJistyHweRKG0ak7xBFpbQOBTDBkl9tARFSePSgstuv0=' \
  -H 'origin: https://www.tiktok.com' \
  -H 'priority: u=1, i' \
  -H 'referer: https://www.tiktok.com/' \
  -H 'sec-ch-ua: "Microsoft Edge";v="149", "Chromium";v="149", "Not)A;Brand";v="24"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: same-site' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0'


### Upload to cloudflare
  for file in ./gifts/*; do
  filename=$(basename "$file")

  wrangler r2 object put "streamplay/app/gifts/$filename" \ 
    --file="$file" \
    --remote
done
