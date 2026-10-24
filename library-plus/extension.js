// Library+ core. Keeps a real private playlist "My Library" in sync with Liked Songs + saved albums,
// so Spotify's own play / shuffle / smart shuffle / search (and Shuffle+) work on the whole library.
// "Listen later" albums live in a second private playlist, so they follow the account to other devices.
// Adds album context-menu items. The page (index.js) uses window.LibraryPlus.

// Pure diff, top-level so test/plan.test.mjs can load it. want: ordered uris; have: playlist rows [{uri, uid}].
function libraryPlusPlan(want, have) {
	const wantSet = new Set(want);
	const kept = new Set();
	const remove = [];
	for (const row of have) {
		if (wantSet.has(row.uri) && !kept.has(row.uri)) kept.add(row.uri);
		else remove.push(row); // not in library anymore, or a duplicate
	}
	return { remove, add: want.filter((uri) => !kept.has(uri)) };
}

// Tracks the user deleted from the playlist by hand in Spotify: in the playlist at the last sync (prev snapshot),
// missing now, still wanted. Sync keeps them out instead of adding them back. prev: {uri: label} | null.
function libraryPlusRemovedByHand(want, have, prev, excluded) {
	if (!prev || !have.length) return [];
	const haveSet = new Set(have.map((row) => row.uri));
	const gone = want.filter((uri) => !haveSet.has(uri) && uri in prev && !(uri in excluded));
	// a big drop is a half-loaded playlist, not the user's hand: never hide a chunk of the library on a glitch
	return gone.length > Math.max(20, want.length * 0.05) ? [] : gone;
}

const LIBRARY_PLUS_STRINGS = {
	en: {
		libraryName: "My Library",
		libraryDesc: "Liked Songs + saved albums. Kept in sync by Library+, manual edits get overwritten.",
		laterName: "Listen Later",
		laterDesc: "Albums saved for later with Library+.",
		nowName: "Library+ · Now Playing",
		nowDesc: "What you last started in Library+ with a filter, sorting, an album shelf or Shuffle+. Rewritten every time.",
		created: "Library+: created the playlist “{0}”",
		createFailed: "could not create the playlist",
		syncError: "Library+: sync error, {0}",
		nothing: "Library+: nothing to play",
		shuffled: "Shuffle+: shuffled {0}",
		addedLater: "Library+: added to “Listen later”",
		addedAlbums: "Library+: added to “Albums”",
		menuAlbums: "Library+: add to Albums",
		menuLater: "Library+: listen later",
		menuUnlater: "Library+: remove from Listen later",
		kicker: "Library+ · playlist",
		syncing: "syncing…",
		updated: "updated at {0}",
		notSynced: "not synced yet",
		error: "error: {0}",
		loading: "Loading…",
		playOrder: "Play in order",
		shuffle: "Shuffle",
		smart: "Smart Shuffle",
		smartTitle: "Spotify's smart shuffle (adds recommendations)",
		shufflePlusTitle: "True random shuffle, like Shuffle+",
		openPlaylist: "Open playlist",
		syncNow: "Sync now",
		search: "Search tracks and albums",
		tabTracks: "Tracks",
		tabAlbums: "Albums",
		tabLater: "Listen later",
		mood: "Mood:",
		sort: "Sort:",
		sortAdded: "Date added",
		sortName: "Title",
		sortArtist: "Artist",
		sortAlbum: "Album",
		sortDuration: "Duration",
		picking: "Picking tracks…",
		playsOnly: "The buttons above play only these {0}",
		playsSorted: "“Play in order” follows this sorting",
		playsShelf: "The buttons above play the tracks of {0}",
		exceptLiked: ", except Liked Songs",
		noLiked: "No Liked Songs",
		noLikedTitle: "Hide Liked Songs and don't play them, on every tab",
		rowTitle: "Double-click to play from here, right-click for the menu",
		more: "Show more ({0})",
		excludeTrack: "Remove from My Library (the like and the album stay)",
		removedLink: "Removed: {0}",
		removedTitle: "Removed tracks",
		removedHint: "These tracks stay out of My Library. Tracks you delete from the playlist in Spotify land here too.",
		bringBack: "Bring back",
		bringBackAll: "Bring back all",
		single: "Single",
		playAlbum: "Play",
		toAlbums: "Move to Albums (save to library)",
		removeLater: "Remove from Listen later",
		openAlbum: "Open album",
		emptyAlbums: "No albums yet. Right-click an album → “Library+: add to Albums”, or press its heart.",
		emptyLater: "Empty. Right-click any album → “Library+: listen later”.",
	},
	ru: {
		libraryName: "Моя библиотека",
		libraryDesc: "Лайки + сохранённые альбомы. Обновляется расширением Library+ сам — ручные правки перезапишутся.",
		laterName: "Послушать позже",
		laterDesc: "Альбомы, отложенные в Library+.",
		nowName: "Library+ · Сейчас играет",
		nowDesc: "То, что вы последним запустили в Library+ с фильтром, сортировкой, с полки альбомов или через Shuffle+. Перезаписывается каждый раз.",
		created: "Library+: создан плейлист «{0}»",
		createFailed: "не удалось создать плейлист",
		syncError: "Library+: ошибка синхронизации — {0}",
		nothing: "Library+: нечего играть",
		shuffled: "Shuffle+: перемешано {0}",
		addedLater: "Library+: добавлено в «Послушать позже»",
		addedAlbums: "Library+: добавлено в «Альбомы»",
		menuAlbums: "Library+: в «Альбомы»",
		menuLater: "Library+: послушать позже",
		menuUnlater: "Library+: убрать из «Послушать позже»",
		kicker: "Library+ · плейлист",
		syncing: "синхронизация…",
		updated: "обновлено в {0}",
		notSynced: "ещё не синхронизировано",
		error: "ошибка: {0}",
		loading: "Загрузка…",
		playOrder: "Слушать по порядку",
		shuffle: "Перемешать",
		smart: "Умное перемешивание",
		smartTitle: "Умное перемешивание Spotify (добавляет рекомендации)",
		shufflePlusTitle: "Честное случайное перемешивание, как в Shuffle+",
		openPlaylist: "Открыть плейлист",
		syncNow: "Синхронизировать сейчас",
		search: "Поиск треков и альбомов",
		tabTracks: "Треки",
		tabAlbums: "Альбомы",
		tabLater: "Послушать позже",
		mood: "Настроение:",
		sort: "Сортировка:",
		sortAdded: "Дата добавления",
		sortName: "Название",
		sortArtist: "Исполнитель",
		sortAlbum: "Альбом",
		sortDuration: "Длительность",
		picking: "Подбираю треки…",
		playsOnly: "Кнопки сверху играют только эти {0}",
		playsSorted: "«Слушать по порядку» играет в этой сортировке",
		playsShelf: "Кнопки сверху играют треки из {0}",
		exceptLiked: ", кроме любимых",
		noLiked: "Без любимых",
		noLikedTitle: "Скрыть любимые треки и не играть их — на всех вкладках",
		rowTitle: "Двойной клик — играть отсюда, правый клик — меню",
		more: "Показать ещё ({0})",
		excludeTrack: "Убрать из «Моей библиотеки» (лайк и альбом остаются)",
		removedLink: "Убрано: {0}",
		removedTitle: "Убранные треки",
		removedHint: "Эти треки не попадают в «Мою библиотеку». Сюда же попадают треки, которые вы удалили из плейлиста прямо в Spotify.",
		bringBack: "Вернуть",
		bringBackAll: "Вернуть все",
		single: "Сингл",
		playAlbum: "Слушать",
		toAlbums: "Перенести в «Альбомы» (сохранить в медиатеку)",
		removeLater: "Убрать из «Послушать позже»",
		openAlbum: "Открыть альбом",
		emptyAlbums: "Нет альбомов. ПКМ по альбому → «Library+: в «Альбомы»» или сердечко.",
		emptyLater: "Пусто. ПКМ по любому альбому → «Library+: послушать позже».",
	},
};

(async function libraryPlus() {
	const S = globalThis.Spicetify;
	// ContextMenu.Item renders with ReactJSX, which can arrive after Platform on a cold start
	if (!S?.Platform?.LibraryAPI || !S.ContextMenu || !S.ReactJSX || !S.GraphQL?.Definitions?.queryAlbumTrackUris || !S.LocalStorage || !S.Locale) {
		setTimeout(libraryPlus, 300);
		return;
	}
	const P = S.Platform;
	const lang = S.Locale.getLocale()?.startsWith("ru") ? "ru" : "en";
	const t = (key, ...args) => (LIBRARY_PLUS_STRINGS[lang][key] ?? LIBRARY_PLUS_STRINGS.en[key]).replace(/\{(\d)\}/g, (_, i) => args[i]);
	const FORMS = {
		en: { tracks: ["track", "tracks"], albums: ["album", "albums"], albumsOf: ["album", "albums"] },
		ru: { tracks: ["трек", "трека", "треков"], albums: ["альбом", "альбома", "альбомов"], albumsOf: ["альбома", "альбомов", "альбомов"] }, // albumsOf: after «из»
	};
	function count(n, what) {
		const f = FORMS[lang][what];
		const m10 = n % 10;
		const m100 = n % 100;
		const word = lang === "ru" ? f[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2] : f[n === 1 ? 0 : 1];
		return `${n.toLocaleString(lang)} ${word}`;
	}

	const FEATURE = { featureIdentifier: "library_plus" };
	const SHUFFLE_MODE = { order: 0, shuffle: 1, smart: 2 };
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const events = new EventTarget(); // "change": library, playlists or shelves changed
	const changed = () => events.dispatchEvent(new Event("change"));
	const state = { syncing: false, lastSync: null, error: null };

	// ---------- playlists ----------
	const LISTS = {
		library: { key: "library-plus:playlist", name: t("libraryName"), desc: t("libraryDesc"), at: { before: "start" } },
		later: { key: "library-plus:later-playlist", name: t("laterName"), desc: t("laterDesc"), at: { before: "start" } },
		now: { key: "library-plus:now-playlist", name: t("nowName"), desc: t("nowDesc"), at: { after: "end" } },
	};
	// The rootlist check can take seconds, so a confirmed playlist is trusted until the next sync checks again
	// (sync runs on every library change, deleting a playlist included).
	const confirmed = new Set();
	async function existing(kind, fresh) {
		const uri = S.LocalStorage.get(LISTS[kind].key);
		if (!uri) return null;
		if (!fresh && confirmed.has(uri)) return uri;
		const ok = (await P.RootlistAPI.contains([uri]))[0];
		ok ? confirmed.add(uri) : confirmed.delete(uri);
		return ok ? uri : null;
	}
	const creating = {};
	async function ensure(kind, fresh) {
		const uri = await existing(kind, fresh);
		if (uri) return uri;
		creating[kind] ??= create(kind).finally(() => delete creating[kind]);
		return creating[kind];
	}
	async function create(kind) {
		const { key, name, desc, at } = LISTS[kind];
		const uri = await P.RootlistAPI.createPlaylist(name, at);
		if (!uri) throw new Error(t("createFailed"));
		await P.RootlistAPI.setPublishedState(uri, false);
		await keepPrivate(uri);
		await P.PlaylistAPI.updateDetails(uri, { description: desc });
		S.LocalStorage.set(key, uri);
		S.showNotification(t("created", name));
		return uri;
	}
	// "private" = base permission BLOCKED, which is what Spotify's own "Make private" sets
	async function keepPrivate(uri) {
		if ((await P.PlaylistPermissionsAPI.getBasePermission(uri)) !== "BLOCKED") await P.PlaylistPermissionsAPI.setBasePermission(uri, "BLOCKED");
	}
	// Reading a 1300-track playlist takes 0.7–6 s, and play() needs one before every start. So reads are cached:
	// our own writes drop the entry, and sync (which also runs on changes made in Spotify) always reads fresh.
	const contentsCache = new Map();
	function contents(uri, fresh) {
		if (fresh || !contentsCache.has(uri)) {
			const read = P.PlaylistAPI.getContents(uri, { limit: 99999 }).then((r) => r.items);
			read.catch(() => contentsCache.delete(uri));
			contentsCache.set(uri, read);
		}
		return contentsCache.get(uri);
	}
	const SILENT = { silent: true }; // no "Added to …" toast for our own background writes
	// One request each: every request waits for the server, and Spotify takes 1300+ rows at once.
	async function addTop(pl, uris) {
		contentsCache.delete(pl);
		if (uris.length) await P.PlaylistAPI.add(pl, uris, { before: "start" }, SILENT);
	}
	async function removeRows(pl, rows) {
		if (!rows.length) return;
		// drop the rows from the cached read instead of re-reading 1300 tracks (a long freeze of Spotify's UI)
		const uids = new Set(rows.map((r) => r.uid));
		const cached = contentsCache.get(pl);
		if (cached) contentsCache.set(pl, cached.then((items) => items.filter((r) => !uids.has(r.uid))));
		await P.PlaylistAPI.remove(pl, rows.map(({ uri, uid }) => ({ uri, uid })));
	}

	// Tracks kept out of "My Library": removed with the × on the page or deleted from the playlist by hand. {uri: label}
	// shortcut: kept on this computer only (only this computer's Library+ syncs); move to the account if that changes
	const KEY_EXCLUDED = "library-plus:excluded";
	const KEY_SNAPSHOT = "library-plus:snapshot"; // playlist contents after the last sync, to spot removals by hand
	function readJSON(key, fallback) {
		try {
			return JSON.parse(S.LocalStorage.get(key)) ?? fallback;
		} catch {
			return fallback;
		}
	}
	function getExcluded() {
		const v = readJSON(KEY_EXCLUDED, {});
		return Array.isArray(v) ? Object.fromEntries(v.map((uri) => [uri, ""])) : v; // 1.3 stored a bare list
	}
	function setExcluded(map) {
		S.LocalStorage.set(KEY_EXCLUDED, JSON.stringify(map));
		sync();
	}
	// what the "Removed" tiles show; 1.3.1 kept a plain "name — artist" string
	const meta = (tr) => ({
		name: tr.name,
		artist: (tr.artists ?? []).map((a) => a.name).join(", "),
		image: (tr.album?.images?.find((i) => i.label === "standard") ?? tr.album?.images?.[0])?.url ?? "",
		album: tr.album?.uri ?? "",
	});
	const asMeta = (v) => (typeof v === "string" ? { name: v, artist: "", image: "", album: "" } : v);

	// Instant: the row leaves the playlist on its own, no full sync (that reads the whole library and took seconds)
	async function excludeTrack(tr) {
		S.LocalStorage.set(KEY_EXCLUDED, JSON.stringify({ ...getExcluded(), [tr.uri]: meta(tr) }));
		changed();
		const pl = await ensure("library");
		await removeRows(pl, (await contents(pl)).filter((row) => row.uri === tr.uri));
		const snap = readJSON(KEY_SNAPSHOT, null);
		if (snap) {
			delete snap[tr.uri];
			S.LocalStorage.set(KEY_SNAPSHOT, JSON.stringify(snap));
		}
		if (running) sync(); // a sync already under way read the old list and would put the track back: run it again
		changed();
	}
	function restoreTracks(uris) {
		const map = getExcluded();
		for (const uri of uris) delete map[uri];
		setExcluded(map); // sync puts them back in their place
	}
	const getRemoved = () => Object.entries(getExcluded()).map(([uri, v]) => ({ uri, ...asMeta(v) }));

	const getAlbums = async () =>
		(await P.LibraryAPI.getContents({ filters: ["0"], limit: 9999 })).items
			.filter((i) => i.type === "album")
			.sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));

	const albumTracksCache = new Map(); // album track lists don't change, so one fetch per session
	async function albumTracks(uri) {
		if (!albumTracksCache.has(uri)) {
			const { data, errors } = await S.GraphQL.Request(S.GraphQL.Definitions.queryAlbumTrackUris, { uri, offset: 0, limit: 500 });
			if (errors) throw new Error(errors[0].message);
			albumTracksCache.set(uri, data.albumUnion.tracksV2.items.map((i) => i.track.uri));
		}
		return albumTracksCache.get(uri);
	}

	// ---------- "Listen later" shelf: albums = album groups of the later playlist ----------
	let laterSet = new Set(); // album uris, for the synchronous context-menu checks
	async function getLater() {
		const pl = await existing("later");
		const albums = new Map();
		for (const tr of pl ? await contents(pl) : []) {
			const a = tr.album;
			if (a && !albums.has(a.uri)) albums.set(a.uri, { uri: a.uri, name: a.name, artists: a.artist ? [a.artist] : tr.artists, images: a.images });
		}
		laterSet = new Set(albums.keys());
		return [...albums.values()];
	}
	async function addLater(uri) {
		const pl = await ensure("later");
		if (!(await contents(pl)).some((tr) => tr.album?.uri === uri)) await addTop(pl, await albumTracks(uri));
		laterSet.add(uri);
	}
	async function removeLater(uri) {
		const pl = await existing("later");
		if (pl) await removeRows(pl, (await contents(pl)).filter((tr) => tr.album?.uri === uri));
		laterSet.delete(uri);
		changed();
	}
	async function toLater(uri) {
		await addLater(uri);
		// "Albums" = saved albums, so moving to the later shelf unsaves it (otherwise sync would move it back)
		await P.LibraryAPI.remove({ uris: [uri], silent: true });
		changed();
		S.showNotification(t("addedLater"));
	}
	async function toAlbums(uri) {
		await P.LibraryAPI.add({ uris: [uri], silent: true });
		if (laterSet.has(uri)) await removeLater(uri);
		S.showNotification(t("addedAlbums"));
	}

	// v1.0 kept the shelf in LocalStorage; move it into the playlist once
	async function migrateLater() {
		const KEY = "library-plus:later";
		const old = JSON.parse(S.LocalStorage.get(KEY) ?? "[]");
		for (const a of [...old].reverse()) await addLater(a.uri); // oldest first, so the newest ends on top
		S.LocalStorage.remove(KEY);
	}

	// ---------- library sync ----------
	async function doSync() {
		const pl = await ensure("library", true);
		await keepPrivate(pl);
		const [liked, albums, later] = await Promise.all([P.LibraryAPI.getTracks({ limit: 99999 }), getAlbums(), getLater()]);
		// shortcut: local files are skipped, Spotify playlists can't hold them reliably
		const rows = liked.items.filter((tr) => !tr.isLocal).map((tr) => ({ uri: tr.uri, t: Date.parse(tr.addedAt), i: 0 }));
		for (const a of albums) {
			const at = Date.parse(a.addedAt);
			(await albumTracks(a.uri)).forEach((uri, i) => rows.push({ uri, t: at, i }));
		}
		rows.sort((a, b) => b.t - a.t || a.i - b.i); // newest first, album tracks in album order
		const wanted = [...new Set(rows.map((r) => r.uri))];

		const have = await contents(pl, true);
		const excluded = getExcluded();
		const prev = readJSON(KEY_SNAPSHOT, null);
		const byHand = libraryPlusRemovedByHand(wanted, have, prev, excluded);
		if (byHand.length) {
			for (const uri of byHand) excluded[uri] = prev[uri];
			S.LocalStorage.set(KEY_EXCLUDED, JSON.stringify(excluded));
		}
		const want = wanted.filter((uri) => !(uri in excluded));
		const { remove, add } = libraryPlusPlan(want, have);
		await removeRows(pl, remove);
		// shortcut: new tracks go to the top (they are the newest); order drifts only if an old item reappears
		await addTop(pl, add);
		S.LocalStorage.set(KEY_SNAPSHOT, JSON.stringify(Object.fromEntries((await contents(pl, true)).map((tr) => [tr.uri, meta(tr)]))));

		for (const kind of ["later", "now"]) {
			const other = await existing(kind, true);
			if (other) await keepPrivate(other);
		}
		const saved = new Set(albums.map((a) => a.uri));
		for (const a of later) if (saved.has(a.uri)) await removeLater(a.uri); // saved since → it's in "Albums" now
		return { added: add.length, removed: remove.length, total: want.length };
	}

	let running = null;
	let again = false;
	function sync() {
		if (running) {
			again = true;
			return running;
		}
		state.syncing = true;
		changed();
		running = (async () => {
			let res;
			try {
				do {
					again = false;
					res = await doSync();
				} while (again);
				state.error = null;
				state.lastSync = Date.now();
			} catch (e) {
				state.error = String(e?.message ?? e);
				console.error("Library+ sync", e);
				S.showNotification(t("syncError", state.error), true);
			} finally {
				state.syncing = false;
				running = null;
				changed();
			}
			return res;
		})();
		return running;
	}

	// ---------- playback ----------
	function shuffle(a) {
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	// Everything is played as a real playlist with Spotify's own modes. A given list (filter, sorting, album shelf)
	// and Shuffle+'s order are first written into the private "Now playing" playlist. Rewriting it takes milliseconds,
	// unlike Shuffle+'s queue trick, whose tracks stay queued even after you play something else.
	// "Now playing" is rewritten on every play. With the sidebar sorted by Recents it would jump and change its
	// mosaic cover each time, so once per playlist: a fixed cover in the theme's colors, and a pin after the user's pins.
	async function dressNow(uri) {
		const KEY = "library-plus:now-dressed";
		if (S.LocalStorage.get(KEY) === uri) return;
		const css = getComputedStyle(document.documentElement);
		const c = document.createElement("canvas");
		c.width = c.height = 300;
		const g = c.getContext("2d");
		g.fillStyle = css.getPropertyValue("--spice-button").trim() || "#1db954";
		g.fillRect(0, 0, 300, 300);
		g.setTransform(300 / 40, 0, 0, 300 / 40, (300 / 40) * 8, (300 / 40) * 8); // the 24-unit icon, centered
		g.strokeStyle = css.getPropertyValue("--spice-main").trim() || "#121212";
		g.lineWidth = 2;
		g.lineCap = "round";
		g.stroke(new Path2D("M4 3v18M9 3v18M14 4l5 16"));
		const jpeg = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
		await P.PlaylistAPI.updateDetails(uri, { imageUploadToken: await P.PlaylistAPI.uploadImage(jpeg) });
		await P.LibraryAPI.pin(uri).catch((e) => console.warn("Library+ pin", e)); // Spotify limits the number of pins
		S.LocalStorage.set(KEY, uri);
	}

	async function setContents(pl, uris) {
		await removeRows(pl, await contents(pl)); // cached rows are safe here: only Library+ writes this playlist
		await P.PlaylistAPI.add(pl, uris, { after: "end" }, SILENT);
		contentsCache.delete(pl);
	}

	// mode: order | shuffle | smart | shuffle+. uris: optional list to play. from: start from this track.
	// kind: the playlist to play when no list is given ("library" or "later").
	async function play(mode, uris, from, kind = "library") {
		try {
			let pl = await ensure(kind);
			if (uris || mode === "shuffle+") {
				let list = uris ?? (await contents(pl)).filter((tr) => tr.isPlayable).map((tr) => tr.uri);
				if (!list.length) {
					S.showNotification(t("nothing"), true);
					return;
				}
				if (mode === "shuffle+") {
					list = shuffle([...list]);
					mode = "order";
					S.showNotification(t("shuffled", count(list.length, "tracks")));
				}
				const fresh = !(await existing("now"));
				pl = await ensure("now");
				await dressNow(pl).catch((e) => console.warn("Library+ now-playlist cover/pin", e));
				const current = (await contents(pl)).map((tr) => tr.uri);
				// same list as last time (another row, another mode): leave the playlist alone, so the player keeps
				// its loaded queue instead of reloading the whole context
				if (current.length !== list.length || current.some((uri, i) => uri !== list[i])) {
					await setContents(pl, list);
					// shortcut: the player can't resolve a playlist created a moment ago; only the very first run waits
					if (fresh) await sleep(2500);
				}
			}
			// play() applies the saved per-playlist mode; ShuffleAPI.setShuffle doesn't save it while the playlist is playing
			// an explicit start track: without it Spotify just keeps going if this playlist is already playing
			const [, rows] = await Promise.all([P.ContextualShuffleAPI.setContextualShuffleMode(pl, SHUFFLE_MODE[mode]), contents(pl)]);
			const playable = rows.filter((tr) => tr.isPlayable);
			const start = from ?? playable[mode === "order" ? 0 : Math.floor(Math.random() * playable.length)]?.uri;
			await P.PlayerAPI.play({ uri: pl }, FEATURE, start ? { skipTo: { uri: start } } : {});
			if (mode === "smart") {
				// smart shuffle only turns on through ShuffleAPI once the playlist is the playing context
				for (let i = 0; i < 50 && P.PlayerAPI.getState()?.context?.uri !== pl; i++) await sleep(100);
				await P.ShuffleAPI.setShuffle(pl, SHUFFLE_MODE.smart);
			}
		} catch (e) {
			console.error("Library+ play", e);
			S.showNotification(`Library+: ${e?.message ?? e}`, true);
		}
	}

	const playUri = (uri) => P.PlayerAPI.play({ uri }, FEATURE, {});

	// Album shelves: play the tracks of these albums (shelf order, then album order), minus the `skip` set
	async function playAlbums(mode, albumUris, skip) {
		try {
			const excluded = getExcluded();
			const uris = (await Promise.all(albumUris.map(albumTracks))).flat().filter((uri) => !(uri in excluded) && !skip?.has(uri));
			await play(mode, uris);
		} catch (e) {
			S.showNotification(`Library+: ${e?.message ?? e}`, true);
		}
	}

	// ---------- data for the page ----------
	const getTracks = async () => contents(await ensure("library"));

	let tagsCache = null;
	// Spotify's mood chips of Liked Songs, e.g. {name: "Rock", filter: "tags contains rock"}. Spotify decides per account
	// whether there are any (the Liked Songs page then shows no chips either); the raw answer is logged for that case.
	async function getTags() {
		if (tagsCache) return tagsCache;
		const raw = (await P.LibraryAPI.getTracksFilterTags?.()) ?? [];
		const tags = raw
			.map((tg) => ({ name: tg.name, tag: /tags\s+contains\s+["']?([^"']+?)["']?\s*$/i.exec(tg.filter ?? "")?.[1] }))
			.filter((tg) => tg.name && tg.tag);
		if (!tags.length) console.info("Library+: no mood filters from Spotify", raw);
		return (tagsCache = tags);
	}

	// Spotify's Liked Songs mood chips are descriptor filters; the same filter works on any playlist.
	async function moodUris(tag) {
		// shortcut: private client (the one LibraryAPI.getTracks uses); re-check if Spotify renames it
		const r = await P.LibraryAPI._playlistDataClient.get({
			uri: await ensure("library"),
			policy: { track: { track: { link: true } } },
			query: { range: { start: 0, length: 99999 }, descriptorFilter: [tag] },
		});
		return new Set(r.data.item.map((i) => i.trackMetadata?.link).filter(Boolean));
	}

	async function load() {
		const pl = await ensure("library");
		const [tracks, albums, later, tags, elig, liked] = await Promise.all([
			getTracks(),
			getAlbums(),
			getLater(),
			getTags().catch(() => []),
			P.SmartShuffleEligibilityAPI.getEligibility(pl).catch(() => ({})),
			P.LibraryAPI.getTracks({ limit: 99999 }),
		]);
		const excluded = getExcluded(); // a just-removed track hides at once, before the playlist write lands
		// all three playlists are the user's own, so the library's answer stands for them
		return {
			playlist: pl,
			tracks: tracks.filter((tr) => !(tr.uri in excluded)),
			albums,
			later,
			tags,
			canSmart: !!elig.canSmartShuffle,
			liked: new Set(liked.items.map((tr) => tr.uri)),
			removedCount: Object.keys(excluded).length,
		};
	}

	// ---------- context menu ----------
	const isAlbum = (uris) => uris.length === 1 && S.URI.isAlbum(uris[0]);
	const safe = (fn) => (uris) => fn(uris[0]).catch((e) => S.showNotification(`Library+: ${e?.message ?? e}`, true));
	new S.ContextMenu.Item(t("menuAlbums"), safe(toAlbums), (u) => isAlbum(u) && !P.LibraryAPI.containsSync(u[0]), "album").register();
	new S.ContextMenu.Item(t("menuLater"), safe(toLater), (u) => isAlbum(u) && !laterSet.has(u[0]), "clock").register();
	new S.ContextMenu.Item(t("menuUnlater"), safe(removeLater), (u) => isAlbum(u) && laterSet.has(u[0]), "x").register();

	// ---------- auto sync ----------
	let timer;
	const scheduleSync = () => {
		clearTimeout(timer);
		timer = setTimeout(sync, 3000);
	};
	const libEvents = P.LibraryAPI.getEvents();
	libEvents.addListener("operation_complete", scheduleSync); // like / unlike / save album here
	libEvents.addListener("update", scheduleSync); // changes from other devices

	window.LibraryPlus = {
		events,
		state,
		t,
		count,
		lang,
		sync,
		play,
		playAlbums,
		load,
		moodUris,
		excludeTrack,
		restoreTracks,
		playUri,
		toAlbums,
		removeLater,
		getRemoved,
	};
	setTimeout(() => migrateLater().catch((e) => console.error("Library+ migrate", e)).finally(sync), 5000);
})();
