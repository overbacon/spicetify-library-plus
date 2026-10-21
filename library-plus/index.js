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
const SORT_LABEL = { added: "sortAdded", name: "sortName", artist: "sortArtist", album: "sortAlbum", duration: "sortDuration" };

function Icon({ name, size = 16 }) {
	return h("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "currentColor", dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons[name] ?? "" } });
}

function Btn({ icon, label, title, onClick, disabled, className = "" }) {
	return h(
		"button",
		{ className: `lp-btn ${className}`, onClick, disabled, title: title ?? label, "aria-label": label ?? title },
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
function NativeMenu({ menu, props, render }) {
	const { RightClickMenu } = Spicetify.ReactComponent;
	const Menu = Spicetify.ReactComponent[menu];
	const plain = render(undefined, undefined);
	if (!RightClickMenu || !Menu) return plain;
	return h(
		Boundary,
		{ fallback: plain },
		h(RightClickMenu, { menu: h(Boundary, { fallback: null }, h(Menu, props)) }, (isOpen, onContextMenu, ref) => render(onContextMenu, ref))
	);
}

function AlbumCard({ uri, name, artists, images, actions }) {
	return h(NativeMenu, {
		menu: "AlbumMenu",
		props: { uri, artistUri: artists?.[0]?.uri },
		render: (onContextMenu, ref) =>
			h(
				"div",
				{ className: "lp-card", onContextMenu, ref },
				h("img", { src: img(images, "standard"), alt: "", loading: "lazy", onClick: () => go(uri) }),
				h("button", { className: "lp-card-name", onClick: () => go(uri), title: name }, name),
				h("div", { className: "lp-card-artist", title: names(artists) }, names(artists)),
				h("div", { className: "lp-card-actions" }, actions)
			),
	});
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
	const [sort, setSort] = useState("added");
	const [limit, setLimit] = useState(200);

	useEffect(() => {
		const f = () => setVer((v) => v + 1);
		LP.events.addEventListener("change", f);
		return () => LP.events.removeEventListener("change", f);
	}, []);
	useEffect(() => {
		let live = true;
		LP.load()
			.then((d) => live && (setData(d), setError(null)))
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
	let tracks = data.tracks.filter((tr) => (!mood || moodSet?.has(tr.uri)) && match(tr.name, tr.album?.name, ...(tr.artists ?? []).map((a) => a.name)));
	if (SORTS[sort]) tracks = [...tracks].sort(SORTS[sort]);
	const albums = data.albums.filter((a) => match(a.name, ...(a.artists ?? []).map((x) => x.name)));
	const later = data.later.filter((a) => match(a.name, ...(a.artists ?? []).map((x) => x.name)));
	const filtered = !!(mood || q);
	const uris = tracks.filter((tr) => tr.isPlayable).map((tr) => tr.uri);
	const subset = filtered ? uris : undefined; // what the shuffles play
	const ordered = filtered || SORTS[sort] ? uris : undefined; // what "in order" plays
	const shelf = tab === "albums" ? albums : tab === "later" ? later : null;
	// the buttons play what the open tab shows
	const playTab = (mode) =>
		!shelf
			? LP.play(mode, mode === "order" ? ordered : subset)
			: tab === "later" && !q && later.length
				? LP.play(mode, undefined, undefined, "later") // the whole later playlist as it is
				: LP.playAlbums(mode, shelf.map((a) => a.uri));

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
		h(Btn, { icon: "repeat", title: t("syncNow"), onClick: () => LP.sync(), disabled: state.syncing }),
		h("input", { className: "lp-search", type: "search", placeholder: t("search"), value: query, onChange: (e) => setQuery(e.target.value), "aria-label": t("search") })
	);

	const tabs = h(
		"div",
		{ className: "lp-tabs", role: "tablist" },
		[
			["tracks", `${t("tabTracks")} · ${tracks.length}`],
			["albums", `${t("tabAlbums")} · ${albums.length}`],
			["later", `${t("tabLater")} · ${later.length}`],
		].map(([id, label]) => h("button", { key: id, role: "tab", "aria-selected": tab === id, className: `lp-chip ${tab === id ? "is-active" : ""}`, onClick: () => setTab(id) }, label))
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
			h(
				"label",
				{ className: "lp-sort lp-muted" },
				t("sort"),
				h("select", { value: sort, onChange: (e) => setSort(e.target.value) }, Object.keys(SORTS).map((k) => h("option", { key: k, value: k }, t(SORT_LABEL[k]))))
			)
		);
		const hint =
			ordered &&
			h("p", { className: "lp-muted lp-hint" }, mood && !moodSet ? t("picking") : filtered ? t("playsOnly", count(uris.length, "tracks")) : t("playsSorted"));
		const rows = tracks.slice(0, limit).map((tr, i) =>
			h(NativeMenu, {
				key: tr.uid || tr.uri,
				menu: "TrackMenu",
				// saveTrackUri unlocks "Add to playlist" / "Save to Liked Songs"; no uid, so no "Remove" (sync would undo it)
				props: { uri: tr.uri, saveTrackUri: tr.uri, artists: tr.artists, albumUri: tr.album?.uri },
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
						h("span", { className: "lp-num" }, i + 1),
						h("img", { src: img(tr.album?.images, "small"), alt: "", loading: "lazy" }),
						h("div", { className: "lp-title" }, h("span", null, tr.name), h("span", { className: "lp-muted" }, names(tr.artists))),
						h("button", { className: "lp-link lp-muted", onClick: () => tr.album && go(tr.album.uri) }, tr.album?.name),
						h("span", { className: "lp-muted lp-dur" }, time(tr.duration?.milliseconds))
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
	} else {
		const isLater = tab === "later";
		body = h(
			"div",
			{ className: "lp-grid" },
			shelf.length === 0 && h("p", { className: "lp-muted" }, t(isLater ? "emptyLater" : "emptyAlbums")),
			shelf.length > 0 && h("p", { className: "lp-muted lp-hint" }, t("playsShelf", count(shelf.length, "albumsOf"))),
			shelf.map((a) =>
				h(AlbumCard, {
					key: a.uri,
					...a,
					actions: [
						h(Btn, { key: "p", icon: "play", title: t("playAlbum"), onClick: () => LP.playUri(a.uri) }),
						isLater
							? h(Btn, { key: "m", icon: "plus-alt", title: t("toAlbums"), onClick: () => LP.toAlbums(a.uri) })
							: h(Btn, { key: "m", icon: "clock", title: t("toLater"), onClick: () => LP.toLater(a.uri) }),
						isLater
							? h(Btn, { key: "x", icon: "x", title: t("removeLater"), onClick: () => LP.removeLater(a.uri) })
							: h(Btn, { key: "x", icon: "x", title: t("removeFromLibrary"), onClick: () => LP.removeAlbum(a.uri) }),
					],
				})
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
