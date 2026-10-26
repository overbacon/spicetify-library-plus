// Library+ page. All logic lives in extension.js (window.LibraryPlus); this file is only the UI.
const { React } = Spicetify;
const { useState, useEffect } = React;
const h = React.createElement;

const go = (uri) => Spicetify.Platform.History.push(`/${uri.split(":").slice(1).join("/")}`);
const img = (images, label) => {
	const i = images?.find((x) => x.label === label) ?? images?.[0];
	return (i?.url ?? "").replace("spotify:image:", "https://i.scdn.co/image/");
};
const time = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}` : "");
const names = (artists) => (artists ?? []).map((a) => a.name).join(", ");
const cmp = (a, b) => (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base", numeric: true });
const SORTS = {
	added: null, // the playlist's own order: newest first
	name: (a, b) => cmp(a.name, b.name),
	artist: (a, b) => cmp(names(a.artists), names(b.artists)) || cmp(a.album?.name, b.album?.name),
	album: (a, b) => cmp(a.album?.name, b.album?.name),
	duration: (a, b) => (a.duration?.milliseconds ?? 0) - (b.duration?.milliseconds ?? 0),
};
const ALBUM_SORTS = {
	added: null, // newest first
	name: (a, b) => cmp(a.name, b.name),
	artist: (a, b) => cmp(names(a.artists), names(b.artists)) || cmp(a.name, b.name),
};
const SORT_LABEL = { added: "sortAdded", name: "sortName", artist: "sortArtist", album: "sortAlbum", duration: "sortDuration" };

// useState that survives leaving the page (Spotify unmounts it)
function usePersisted(key, initial) {
	const [value, setValue] = useState(() => Spicetify.LocalStorage.get(`library-plus:${key}`) ?? initial);
	const set = (v) => {
		Spicetify.LocalStorage.set(`library-plus:${key}`, v);
		setValue(v);
	};
	return [value, set];
}

function SortSelect({ t, value, onChange, sorts }) {
	return h(
		"label",
		{ className: "lp-sort lp-muted" },
		t("sort"),
		h("select", { value, onChange: (e) => onChange(e.target.value) }, Object.keys(sorts).map((k) => h("option", { key: k, value: k }, t(SORT_LABEL[k]))))
	);
}

function Icon({ name, size = 16 }) {
	return h("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "currentColor", dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons[name] ?? "" } });
}

// Row number that turns into a play button on hover or keyboard focus, like Spotify's track lists.
function RowNum({ n, label, onPlay }) {
	return h(
		"span",
		{ className: "lp-num" },
		h("span", { className: "lp-num-n" }, n),
		h("button", { className: "lp-num-play", title: label, "aria-label": label, onClick: (e) => (e.stopPropagation(), onPlay()), onDoubleClick: (e) => e.stopPropagation() }, h(Icon, { name: "play" }))
	);
}

function Btn({ icon, label, title, onClick, disabled, pressed, className = "" }) {
	return h(
		"button",
		{ className: `lp-btn ${pressed ? "is-active" : ""} ${className}`, onClick, disabled, title: title ?? label, "aria-label": label ?? title, "aria-pressed": pressed },
		icon && h(Icon, { name: icon }),
		label && h("span", null, label)
	);
}

// Spotify's own menus can throw on a future client update; that must not take the page down.
class Boundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = { failed: false };
	}
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}

// Right-click → Spotify's native track / album menu (with items other extensions added, Shuffle+ included).
// render(onContextMenu, ref) builds the trigger element.
// menu: a ready menu element (Spotify's TrackMenu / AlbumMenu, or our own built from its Menu parts).
function NativeMenu({ menu, render }) {
	const { RightClickMenu } = Spicetify.ReactComponent;
	const plain = render(undefined, undefined);
	if (!RightClickMenu || !menu) return plain;
	return h(Boundary, { fallback: plain }, h(RightClickMenu, { menu: h(Boundary, { fallback: null }, menu) }, (isOpen, onContextMenu, ref) => render(onContextMenu, ref)));
}

// Spotify's own menu for an album of the later shelf would lack our actions (Spicetify only adds extension items to
// menus Spotify opens itself), so this one is built from Spotify's Menu parts and looks the same.
function LaterMenu({ LP, uri, last }) {
	const { Menu, MenuItem } = Spicetify.ReactComponent;
	const { t } = LP;
	return h(
		Menu,
		null,
		last && h(MenuItem, { onClick: () => LP.playLaterFrom(uri, last.uri, last.pos) }, t("resume", "")),
		h(MenuItem, { onClick: () => LP.playUri(uri) }, t(last ? "fromStart" : "playAlbum")),
		last && h(MenuItem, { onClick: () => LP.resetLaterProgress(uri) }, t("resetProgress")),
		h(MenuItem, { onClick: () => LP.toAlbums(uri) }, t("toAlbums")),
		h(MenuItem, { onClick: () => LP.removeLater(uri) }, t("removeLater")),
		h(MenuItem, { onClick: () => go(uri) }, t("openAlbum"))
	);
}

// Spotify-style album tile: cover, title, "Single • artist". No buttons; click opens it, right-click for the menu.
// On the Listen later shelf (onOpen given) a tile shows listening progress and opens the album view.
function AlbumCard({ t, LP, onOpen, uri, name, artists, images, albumType, total, heard, last }) {
	const kind = albumType === "single" ? `${t("single")} • ` : albumType === "ep" ? "EP • " : "";
	const sub = kind + names(artists) + (onOpen && heard ? ` • ${t("progressOf", heard, total)}` : "");
	const open = onOpen ? () => onOpen(uri) : () => go(uri);
	const { AlbumMenu, Menu, MenuItem } = Spicetify.ReactComponent;
	return h(NativeMenu, {
		menu: onOpen ? Menu && MenuItem && h(LaterMenu, { LP, uri, last }) : AlbumMenu && h(AlbumMenu, { uri, artistUri: artists?.[0]?.uri }),
		render: (onContextMenu, ref) =>
			h(
				"div",
				{ className: "lp-card", onContextMenu, ref, role: "link", tabIndex: 0, onClick: open, onKeyDown: (e) => e.key === "Enter" && open() },
				h(
					"div",
					{ className: "lp-card-cover" },
					h("img", { src: img(images, "standard"), alt: "", loading: "lazy" }),
					onOpen && (heard || last) ? h("div", { className: "lp-progress" }, h("div", { style: { width: `${Math.round((heard / Math.max(total, 1)) * 100)}%` } })) : null
				),
				h("div", { className: "lp-card-name", title: name }, name),
				h("div", { className: "lp-card-artist", title: sub }, sub)
			),
	});
}

// Listen later album view: every track with a mark for listened ones and for where you stopped, plus Continue.
function LaterAlbum({ LP, album, ver, close }) {
	const { t } = LP;
	const [d, setD] = useState(null);
	useEffect(() => {
		let live = true;
		LP.laterAlbum(album.uri).then((x) => live && setD(x), () => {});
		return () => {
			live = false;
		};
	}, [album.uri, ver]);
	const heard = d ? d.tracks.filter((tr) => d.heard[tr.uri]).length : album.heard;
	const lastTrack = d?.last && d.tracks.find((tr) => tr.uri === d.last.uri);
	return h(
		React.Fragment,
		null,
		h(
			"div",
			{ className: "lp-moods" },
			h(Btn, { label: "‹ " + t("tabLater"), onClick: close }),
			h("span", { className: "lp-removed-title" }, album.name),
			h("span", { className: "lp-muted" }, names(album.artists)),
			d && h("span", { className: "lp-muted" }, "· " + t("heardOf", heard, d.tracks.length)),
			h(
				"span",
				{ className: "lp-push lp-later-actions" },
				lastTrack && h(Btn, { icon: "play", label: t("resume", `${lastTrack.name} (${time(d.last.pos) || "0:00"})`), onClick: () => LP.playLaterFrom(album.uri, d.last.uri, d.last.pos) }),
				h(Btn, { label: t("fromStart"), onClick: () => d?.tracks[0] && LP.playLaterFrom(album.uri, d.tracks[0].uri) }),
				d?.last && h(Btn, { label: t("resetProgress"), onClick: () => LP.resetLaterProgress(album.uri) })
			)
		),
		h(
			"div",
			{ className: "lp-list" },
			(d?.tracks ?? []).map((tr, i) =>
				h(
					"div",
					{
						key: tr.uri,
						className: `lp-row lp-row-later ${d.heard[tr.uri] ? "is-heard" : ""} ${tr.playable ? "" : "is-disabled"}`,
						role: "button",
						tabIndex: 0,
						title: t("rowTitle"),
						onDoubleClick: () => LP.playLaterFrom(album.uri, tr.uri),
						onKeyDown: (e) => e.key === "Enter" && LP.playLaterFrom(album.uri, tr.uri),
					},
					h(RowNum, { n: i + 1, label: t("playTrack", tr.name), onPlay: () => LP.playLaterFrom(album.uri, tr.uri) }),
					h("span", { className: "lp-heard", title: d.heard[tr.uri] ? t("heardTrack") : "" }, d.heard[tr.uri] ? h(Icon, { name: "check" }) : null),
					h(
						"div",
						{ className: "lp-title" },
						h("span", null, tr.name),
						h("span", { className: "lp-muted" }, tr.artists, d.last?.uri === tr.uri ? h("span", { className: "lp-stopped" }, ` · ${t("stoppedHere")} ${time(d.last.pos)}`) : null)
					),
					h("span", { className: "lp-muted lp-dur" }, time(tr.duration))
				)
			)
		)
	);
}

// "Removed" tab: removed tracks grouped by album, as Spotify-style tiles; a tile opens just that album's removed tracks.
function groupRemoved(items) {
	const groups = new Map();
	for (const it of items) {
		const key = it.album || "";
		if (!groups.has(key)) groups.set(key, { key, name: it.albumName, artist: it.artist, image: it.image, items: [] });
		groups.get(key).items.push(it);
	}
	return [...groups.values()];
}
const cover = (url) => (url ?? "").replace("spotify:image:", "https://i.scdn.co/image/");

function RemovedTab({ LP, groups, open, setOpen, restore }) {
	const { t, count } = LP;
	const { Menu, MenuItem } = Spicetify.ReactComponent;
	const all = groups.flatMap((g) => g.items.map((it) => it.uri));
	if (!open)
		return h(
			React.Fragment,
			null,
			h(
				"div",
				{ className: "lp-moods" },
				h("span", { className: "lp-muted" }, all.length ? t("removedHint") : t("nothingRemoved")),
				all.length > 1 && h(Btn, { label: t("bringBackAll"), onClick: () => restore(all), className: "lp-push" })
			),
			h(
				"div",
				{ className: "lp-grid" },
				groups.map((g) =>
					h(NativeMenu, {
						key: g.key,
						menu:
							Menu &&
							MenuItem &&
							h(Menu, null, h(MenuItem, { onClick: () => restore(g.items.map((it) => it.uri)) }, t("bringBackAlbum")), g.key && h(MenuItem, { onClick: () => go(g.key) }, t("openAlbum"))),
						render: (onContextMenu, ref) =>
							h(
								"div",
								{ className: "lp-card", onContextMenu, ref, role: "button", tabIndex: 0, onClick: () => setOpen(g.key), onKeyDown: (e) => e.key === "Enter" && setOpen(g.key) },
								g.image ? h("img", { src: cover(g.image), alt: "", loading: "lazy" }) : h("div", { className: "lp-card-blank" }, h(Icon, { name: "album", size: 48 })),
								h("div", { className: "lp-card-name", title: g.name }, g.name || t("otherAlbum")),
								h("div", { className: "lp-card-artist" }, [g.artist, count(g.items.length, "tracks")].filter(Boolean).join(" • "))
							),
					})
				)
			)
		);
	return h(
		React.Fragment,
		null,
		h(
			"div",
			{ className: "lp-moods" },
			h(Btn, { label: "‹ " + t("backToRemoved"), onClick: () => setOpen(null) }),
			h("span", { className: "lp-removed-title" }, open.name || t("otherAlbum")),
			h("span", { className: "lp-muted" }, open.artist),
			open.items.length > 1 && h(Btn, { label: t("bringBackAll"), onClick: () => restore(open.items.map((it) => it.uri)), className: "lp-push" })
		),
		h(
			"div",
			{ className: "lp-list" },
			open.items.map((it, i) =>
				h(
					"div",
					{ key: it.uri, className: "lp-row lp-row-removed" },
					h("span", { className: "lp-num" }, i + 1),
					it.image ? h("img", { src: cover(it.image), alt: "", loading: "lazy" }) : h("span"),
					h("div", { className: "lp-title" }, h("span", null, it.name || it.uri), h("span", { className: "lp-muted" }, it.artist)),
					h(Btn, { label: t("bringBack"), onClick: () => restore([it.uri]) })
				)
			)
		)
	);
}

// Sort-Play (another extension) puts its button only into Spotify's playlist pages and has no API to open its menu.
// So this opens the playlist and presses Sort-Play's own button there.
const hasSortPlay = () => !!window.SortPlaySyncUtils || [...document.scripts].some((s) => /sort-play/i.test(s.src));
function openSortPlay(uri) {
	go(uri);
	let tries = 0;
	const id = setInterval(() => {
		const btn = [...document.querySelectorAll("button")].find((b) => b.title === "sort-play extension" || /^Sorts*Play/i.test(b.textContent.trim()));
		if (btn || ++tries > 60) {
			clearInterval(id);
			btn?.click();
		}
	}, 100);
}

function Page({ LP }) {
	const { t, count, state } = LP;
	const [ver, setVer] = useState(0);
	const [data, setData] = useState(null);
	const [error, setError] = useState(null);
	const [tab, setTab] = useState("tracks");
	const [query, setQuery] = useState("");
	const [mood, setMood] = useState(null);
	const [moodSet, setMoodSet] = useState(null);
	const [sort, setSort] = usePersisted("sort", "added");
	const [albumSort, setAlbumSort] = usePersisted("album-sort", "added");
	const [limit, setLimit] = useState(200);
	const [gone, setGone] = useState(() => new Set()); // rows hidden on click, until fresh data (which excludes them) arrives
	const [removedAlbum, setRemovedAlbum] = useState(null); // album opened inside the Removed tab
	const [laterAlbum, setLaterAlbum] = useState(null); // album opened inside the Listen later tab
	const [noLikedFlag, setNoLikedFlag] = usePersisted("no-liked", "0");
	const noLiked = noLikedFlag === "1";

	useEffect(() => {
		const f = () => setVer((v) => v + 1);
		LP.events.addEventListener("change", f);
		return () => LP.events.removeEventListener("change", f);
	}, []);
	useEffect(() => {
		let live = true;
		LP.load()
			.then((d) => live && (setData(d), setGone(new Set()), setError(null)))
			.catch((e) => live && setError(String(e?.message ?? e)));
		return () => {
			live = false;
		};
	}, [ver]);
	useEffect(() => {
		let live = true;
		setMoodSet(null);
		if (mood) LP.moodUris(mood.tag).then((s) => live && setMoodSet(s), (e) => live && setError(String(e?.message ?? e)));
		return () => {
			live = false;
		};
	}, [mood, ver]);
	useEffect(() => setLimit(200), [query, mood, tab, sort]);

	if (!data) return h("section", { className: "lp-page" }, h("p", { className: "lp-muted" }, error ? t("error", error) : t("loading")));

	const q = query.trim().toLowerCase();
	const match = (...s) => !q || s.some((x) => x?.toLowerCase().includes(q));
	const skip = noLiked ? data.liked : null; // liked tracks hidden and not played while "No Liked Songs" is on
	let tracks = data.tracks.filter(
		(tr) => !gone.has(tr.uri) && !skip?.has(tr.uri) && (!mood || moodSet?.has(tr.uri)) && match(tr.name, tr.album?.name, ...(tr.artists ?? []).map((a) => a.name))
	);
	if (SORTS[sort]) tracks = [...tracks].sort(SORTS[sort]);
	const shelfOf = (list) => {
		const out = list.filter((a) => match(a.name, ...(a.artists ?? []).map((x) => x.name)));
		return ALBUM_SORTS[albumSort] ? out.sort(ALBUM_SORTS[albumSort]) : out;
	};
	const albums = shelfOf(data.albums);
	const later = shelfOf(data.later);
	const filtered = !!(mood || q || skip);
	const uris = tracks.filter((tr) => tr.isPlayable).map((tr) => tr.uri);
	const subset = filtered ? uris : undefined; // what the shuffles play
	const ordered = filtered || SORTS[sort] ? uris : undefined; // what "in order" plays
	const shelf = tab === "albums" ? albums : tab === "later" ? later : null;
	const laterOpen = tab === "later" ? data.later.find((a) => a.uri === laterAlbum) : null;
	const removedGroups = groupRemoved(data.removed.filter((it) => !gone.has(it.uri) && match(it.name, it.artist, it.albumName)));
	const removedOpen = removedGroups.find((g) => g.key === removedAlbum);
	const removedUris = (removedOpen ? removedOpen.items : removedGroups.flatMap((g) => g.items)).map((it) => it.uri);
	const restore = (list) => (setGone(new Set([...gone, ...list])), LP.restoreTracks(list));
	// the buttons play what the open tab shows
	const playTab = (mode) =>
		tab === "removed"
			? LP.play(mode, removedUris)
			: !shelf
			? LP.play(mode, mode === "order" ? ordered : subset)
			: tab === "later" && !laterOpen && !q && !skip && !ALBUM_SORTS[albumSort] && later.length
				? LP.play(mode, undefined, undefined, "later") // the whole later playlist as it is
				: LP.playAlbums(mode, (laterOpen ? [laterOpen] : shelf).map((a) => a.uri), skip);

	const header = h(
		"header",
		{ className: "lp-header" },
		h("div", { className: "lp-cover" }, h(Icon, { name: "library", size: 64 })),
		h(
			"div",
			{ className: "lp-head-text" },
			h("span", { className: "lp-kicker" }, t("kicker")),
			h("h1", null, t("libraryName")),
			h(
				"p",
				{ className: "lp-muted" },
				`${count(data.tracks.length, "tracks")} · ${count(data.albums.length, "albums")} · `,
				state.syncing
					? t("syncing")
					: state.lastSync
						? t("updated", new Date(state.lastSync).toLocaleTimeString(LP.lang, { hour: "2-digit", minute: "2-digit" }))
						: t("notSynced"),
				state.error && h("span", { className: "lp-error" }, ` · ${t("error", state.error)}`)
			)
		)
	);

	const actions = h(
		"div",
		{ className: "lp-actions" },
		h("button", { className: "lp-play", onClick: () => playTab("order"), title: t("playOrder"), "aria-label": t("playOrder") }, h(Icon, { name: "play", size: 24 })),
		h(Btn, { icon: "shuffle", label: t("shuffle"), onClick: () => playTab("shuffle") }),
		h(Btn, {
			icon: "enhance",
			label: t("smart"),
			title: t("smartTitle"),
			onClick: () => playTab("smart"),
			disabled: !data.canSmart,
		}),
		h(Btn, { icon: "shuffle", label: "Shuffle+", title: t("shufflePlusTitle"), onClick: () => playTab("shuffle+") }),
		h(Btn, { icon: "playlist", title: t("openPlaylist"), onClick: () => go(data.playlist) }),
		hasSortPlay() && h(Btn, { label: "Sort Play", title: t("sortPlayTitle"), onClick: () => openSortPlay(tab === "later" && data.laterPlaylist ? data.laterPlaylist : data.playlist) }),
		h(Btn, { icon: "repeat", title: t("syncNow"), onClick: () => LP.sync(), disabled: state.syncing }),
		h(Btn, { icon: "heart", label: t("noLiked"), title: t("noLikedTitle"), onClick: () => setNoLikedFlag(noLiked ? "0" : "1"), pressed: noLiked, className: "lp-push" }),
		h("input", { className: "lp-search", type: "search", placeholder: t("search"), value: query, onChange: (e) => setQuery(e.target.value), "aria-label": t("search") })
	);

	const tabs = h(
		"div",
		{ className: "lp-tabs", role: "tablist" },
		[
			["tracks", `${t("tabTracks")} · ${tracks.length}`],
			["albums", `${t("tabAlbums")} · ${albums.length}`],
			["later", `${t("tabLater")} · ${later.length}`],
			(data.removed.length > 0 || tab === "removed") && ["removed", `${t("tabRemoved")} · ${removedGroups.reduce((n, g) => n + g.items.length, 0)}`],
		].filter(Boolean).map(([id, label]) => h("button", { key: id, role: "tab", "aria-selected": tab === id, className: `lp-chip ${tab === id ? "is-active" : ""}`, onClick: () => setTab(id) }, label))
	);

	let body;
	if (tab === "tracks") {
		const tools = h(
			"div",
			{ className: "lp-moods" },
			data.tags.length > 0 && h("span", { className: "lp-muted" }, t("mood")),
			data.tags.map((m) =>
				h("button", { key: m.tag, className: `lp-chip small ${mood?.tag === m.tag ? "is-active" : ""}`, "aria-pressed": mood?.tag === m.tag, onClick: () => setMood(mood?.tag === m.tag ? null : m) }, m.name)
			),
			h(SortSelect, { t, value: sort, onChange: setSort, sorts: SORTS })
		);
		const hint =
			ordered &&
			h("p", { className: "lp-muted lp-hint" }, mood && !moodSet ? t("picking") : filtered ? t("playsOnly", count(uris.length, "tracks")) : t("playsSorted"));
		const rows = tracks.slice(0, limit).map((tr, i) =>
			h(NativeMenu, {
				key: tr.uid || tr.uri,
				// saveTrackUri unlocks "Add to playlist" / "Save to Liked Songs"; no uid, so no "Remove" (sync would undo it)
				menu:
					Spicetify.ReactComponent.TrackMenu &&
					h(Spicetify.ReactComponent.TrackMenu, { uri: tr.uri, saveTrackUri: tr.uri, artists: tr.artists, albumUri: tr.album?.uri }),
				render: (onContextMenu, ref) =>
					h(
						"div",
						{
							ref,
							onContextMenu,
							className: `lp-row ${tr.isPlayable ? "" : "is-disabled"}`,
							role: "button",
							tabIndex: 0,
							title: t("rowTitle"),
							onDoubleClick: () => LP.play("order", ordered, tr.uri),
							onKeyDown: (e) => e.key === "Enter" && LP.play("order", ordered, tr.uri),
						},
						h(RowNum, { n: i + 1, label: t("playTrack", tr.name), onPlay: () => LP.play("order", ordered, tr.uri) }),
						h("img", { src: img(tr.album?.images, "small"), alt: "", loading: "lazy" }),
						h("div", { className: "lp-title" }, h("span", null, tr.name), h("span", { className: "lp-muted" }, names(tr.artists))),
						h("button", { className: "lp-link lp-muted", onClick: () => tr.album && go(tr.album.uri) }, tr.album?.name),
						h("span", { className: "lp-muted lp-dur" }, time(tr.duration?.milliseconds)),
						h(
							"button",
							{
								className: "lp-row-x",
								title: t("excludeTrack"),
								"aria-label": t("excludeTrack"),
								onClick: (e) => (e.stopPropagation(), setGone(new Set(gone).add(tr.uri)), LP.excludeTrack(tr)),
								onDoubleClick: (e) => e.stopPropagation(),
							},
							h(Icon, { name: "x" })
						)
					),
			})
		);
		body = h(
			React.Fragment,
			null,
			tools,
			hint,
			h("div", { className: "lp-list" }, rows),
			tracks.length > limit && h(Btn, { label: t("more", tracks.length - limit), onClick: () => setLimit(limit + 200), className: "lp-more" })
		);
	} else if (laterOpen) {
		body = h(LaterAlbum, { LP, album: laterOpen, ver, close: () => setLaterAlbum(null) });
	} else if (tab === "removed") {
		body = h(RemovedTab, { LP, groups: removedGroups, open: removedOpen, setOpen: setRemovedAlbum, restore });
	} else {
		body = h(
			React.Fragment,
			null,
			h(
				"div",
				{ className: "lp-moods" },
				h("span", { className: "lp-muted" }, shelf.length ? t("playsShelf", count(shelf.length, "albumsOf")) + (skip ? t("exceptLiked") : "") : t(tab === "later" ? "emptyLater" : "emptyAlbums")),
				h(SortSelect, { t, value: albumSort, onChange: setAlbumSort, sorts: ALBUM_SORTS })
			),
			h(
				"div",
				{ className: "lp-grid" },
				shelf.map((a) => h(AlbumCard, { key: a.uri, t, LP, onOpen: tab === "later" ? setLaterAlbum : null, ...a }))
			)
		);
	}

	return h("section", { className: "lp-page" }, header, actions, tabs, body);
}

// The page can open before extension.js has finished starting (e.g. Spotify restored this page on launch).
function App() {
	const [LP, setLP] = useState(() => window.LibraryPlus);
	useEffect(() => {
		if (LP) return;
		const id = setInterval(() => window.LibraryPlus && setLP(window.LibraryPlus), 200);
		return () => clearInterval(id);
	}, [LP]);
	return LP ? h(Page, { LP }) : h("section", { className: "lp-page" }, h("p", { className: "lp-muted" }, "…"));
}

function render() {
	return h(App);
}
