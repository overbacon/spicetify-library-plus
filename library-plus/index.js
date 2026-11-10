// Library+ page. All logic lives in extension.js (window.LibraryPlus); this file is only the UI.
const { React } = Spicetify;
const { useState, useEffect, useRef, useCallback, memo } = React;
const h = React.createElement;

const go = (uri) => Spicetify.Platform.History.push(`/${uri.split(":").slice(1).join("/")}`);
const img = (images, label) => {
	const i = images?.find((x) => x.label === label) ?? images?.[0];
	return (i?.url ?? "").replace("spotify:image:", "https://i.scdn.co/image/");
};
const time = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}` : "");
// whole album length like Spotify writes it: "47 min 12 sec", or "1 hr 5 min" from an hour up
const albumTime = (t, ms) => {
	const m = Math.floor(ms / 60000);
	return m >= 60 ? t("durHours", Math.floor(m / 60), m % 60) : t("durMinutes", m, Math.floor(ms / 1000) % 60);
};
const names = (artists) => (artists ?? []).map((a) => a.name).join(", ");
const cmp = (a, b) => (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base", numeric: true });
const SORTS = {
	added: null, // the playlist's own order: newest first
	name: (a, b) => cmp(a.name, b.name),
	artist: (a, b) => cmp(names(a.artists), names(b.artists)) || cmp(a.album?.name, b.album?.name),
	album: (a, b) => cmp(a.album?.name, b.album?.name),
	duration: (a, b) => (a.duration?.milliseconds ?? 0) - (b.duration?.milliseconds ?? 0),
};
const FIRST_ROWS = 40;
const ALBUM_SORTS = {
	added: null, // newest first
	name: (a, b) => cmp(a.name, b.name),
	artist: (a, b) => cmp(names(a.artists), names(b.artists)) || cmp(a.name, b.name),
};
const SORT_LABEL = { added: "sortAdded", name: "sortName", artist: "sortArtist", album: "sortAlbum", duration: "sortDuration" };
// What ▶ plays with, switched by the shuffle button like Spotify's own: off → shuffle → smart → Shuffle+
const MODES = ["order", "shuffle", "smart", "shuffle+"];
const MODE_ICON = { order: "shuffle", shuffle: "shuffle", smart: "smartShuffle", "shuffle+": "shuffle" };
const MODE_LABEL = { order: "modeOrder", shuffle: "shuffle", smart: "smart", "shuffle+": "modePlus" };
// the header's tint, also given to Spotify's top bar when scrolled so the two meet without a seam
const TINT = "color-mix(in srgb, var(--spice-button) 22%, var(--spice-main))";

// useState that survives leaving the page (Spotify unmounts it)
function usePersisted(key, initial) {
	const [value, setValue] = useState(() => Spicetify.LocalStorage.get(`library-plus:${key}`) ?? initial);
	const set = (v) => {
		Spicetify.LocalStorage.set(`library-plus:${key}`, v);
		setValue(v);
	};
	return [value, set];
}

// Spicetify's "smartShuffle" is an old, different drawing; this is the 16px icon Spotify's own player shows for Smart Shuffle
const ICONS = {
	smartShuffle:
		"<path d='M4.502 0a.637.637 0 0 1 .634.58 4.84 4.84 0 0 0 .81 2.184c.515.739 1.297 1.356 2.487 1.486a.637.637 0 0 1 0 1.267c-1.19.13-1.972.747-2.487 1.487a4.8 4.8 0 0 0-.81 2.185.637.637 0 0 1-1.268 0 4.8 4.8 0 0 0-.81-2.185C2.543 6.265 1.76 5.648.57 5.518a.637.637 0 0 1 0-1.268c1.19-.13 1.972-.747 2.487-1.486a4.84 4.84 0 0 0 .81-2.185A.637.637 0 0 1 4.502 0m4.765 11.878c.056.065.126.15.198.236l.33.397.013.015A3 3 0 0 0 12.1 13.59h1.009l-.444.443a.75.75 0 0 0 1.061 1.06l2.254-2.253-2.254-2.254a.75.75 0 0 0-1.06 1.06l.443.444H12.1a1.5 1.5 0 0 1-1.146-.533l-.004-.005-.333-.4-.288-.343-.031-.035-.02-.021-.037-.037-.974 1.16Z'/><path d='M12.69 4.196a.75.75 0 0 1 1.06 0l2.254 2.254-2.254 2.254a.75.75 0 0 1-1.06-1.06l.443-.444h-1.008a1.5 1.5 0 0 0-1.15.536l-4.63 5.517c-.344.411-.982 1.021-1.822 1.021v-1.5c.122 0 .371-.124.674-.485l4.63-5.517A3 3 0 0 1 12.125 5.7h1.008l-.443-.443a.75.75 0 0 1 0-1.061'/>",
};

function Icon({ name, size = 16 }) {
	return h("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "currentColor", dangerouslySetInnerHTML: { __html: ICONS[name] ?? Spicetify.SVGIcons[name] ?? "" } });
}

// Row number that turns into a play button on hover or keyboard focus, like Spotify's track lists.
// The playing row shows an equalizer instead (still while paused); its hover button pauses / resumes instead.
function RowNum({ n, label, onPlay, now, t }) {
	const playing = now && !now.paused;
	const click = (e) => (e.stopPropagation(), now ? Spicetify.Player.togglePlay() : onPlay());
	const tip = playing ? t("pauseTrack") : label;
	return h(
		"span",
		{ className: "lp-num" },
		now
			? h("span", { className: `lp-num-n lp-eq ${playing ? "" : "is-paused"}`, "aria-hidden": true }, h("i"), h("i"), h("i"))
			: h("span", { className: "lp-num-n" }, n),
		h("button", { className: "lp-num-play", title: tip, "aria-label": tip, onClick: click, onDoubleClick: (e) => e.stopPropagation() }, h(Icon, { name: playing ? "pause" : "play" }))
	);
}

// What Spotify is playing right now, kept up to date from player events.
function usePlaying() {
	const read = () => {
		const st = Spicetify.Platform.PlayerAPI.getState();
		return { uri: st?.item?.uri ?? null, paused: !!st?.isPaused };
	};
	const [now, setNow] = useState(read);
	useEffect(() => {
		const update = () => setNow(read());
		Spicetify.Player.addEventListener("songchange", update);
		Spicetify.Player.addEventListener("onplaypause", update);
		return () => {
			Spicetify.Player.removeEventListener("songchange", update);
			Spicetify.Player.removeEventListener("onplaypause", update);
		};
	}, []);
	return now;
}

// Spotify's own pages fade in a solid top bar as you scroll; a custom app's stays see-through and the header shows
// through it. This does the same for this page and gives the bar back untouched on leaving.
function useTopBar(ref) {
	useEffect(() => {
		const bg = document.querySelector(".main-topBar-background");
		// OverlayScrollbars' viewport switches to overflow: hidden while the page is short, so it is found by its attribute
		let sc = ref.current?.closest("[data-overlayscrollbars-viewport]") ?? ref.current?.parentElement;
		while (sc && !sc.matches("[data-overlayscrollbars-viewport]") && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
		if (!bg || !sc) return;
		const f = () => (bg.style.opacity = String(Math.min(1, sc.scrollTop / 160)));
		bg.style.backgroundColor = TINT;
		f();
		sc.addEventListener("scroll", f, { passive: true });
		return () => {
			sc.removeEventListener("scroll", f);
			bg.style.opacity = "0";
			bg.style.backgroundColor = "";
		};
	}, []);
}

function Btn({ icon, label, title, onClick, disabled, pressed, className = "" }) {
	return h(
		"button",
		{ className: `lp-btn ${pressed ? "is-active" : ""} ${className}`, onClick, disabled, title: title ?? label, "aria-label": label ?? title, "aria-pressed": pressed },
		icon && h(Icon, { name: icon }),
		label && h("span", null, label)
	);
}

function BackBtn({ t, onClick }) {
	return h("button", { className: "lp-back", onClick, title: t("back"), "aria-label": t("back") }, h(Icon, { name: "chevron-left" }));
}

// Centered message for an empty tab or a search with no results, like Spotify's empty pages.
function Empty({ icon, title, text, action }) {
	return h("div", { className: "lp-empty" }, icon && h(Icon, { name: icon, size: 48 }), h("h2", null, title), text && h("p", { className: "lp-muted" }, text), action);
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

// The page's own menus. Spotify 1.3.8 opens menus built from its Menu / MenuItem parts empty (and its TrackMenu not at
// all), so only its AlbumMenu is still used; these look like Spotify's and don't depend on its internals.
// items: [{ label, onClick, disabled, checked, divider }] (falsy entries are skipped).
function PopMenu({ x, y, items, trigger, onClose }) {
	const ref = useRef();
	const [pos, setPos] = useState({ left: x, top: y, visibility: "hidden" });
	React.useLayoutEffect(() => {
		const r = ref.current.getBoundingClientRect();
		setPos({ left: Math.max(8, Math.min(x, innerWidth - r.width - 8)), top: y + r.height > innerHeight - 8 ? Math.max(8, y - r.height) : y });
		ref.current.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
	}, []);
	useEffect(() => {
		const away = (e) => !ref.current?.contains(e.target) && !trigger?.contains(e.target) && onClose();
		const keys = (e) => {
			if (e.key === "Escape") return e.stopPropagation(), onClose(), trigger?.focus();
			if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
			e.preventDefault();
			const list = [...ref.current.querySelectorAll("button:not(:disabled)")];
			const i = list.indexOf(document.activeElement);
			list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
		};
		const scroll = (e) => !ref.current?.contains(e.target) && onClose();
		document.addEventListener("mousedown", away, true);
		document.addEventListener("keydown", keys, true);
		document.addEventListener("scroll", scroll, true);
		window.addEventListener("blur", onClose);
		return () => {
			document.removeEventListener("mousedown", away, true);
			document.removeEventListener("keydown", keys, true);
			document.removeEventListener("scroll", scroll, true);
			window.removeEventListener("blur", onClose);
		};
	}, []);
	return Spicetify.ReactDOM.createPortal(
		h(
			"div",
			{ ref, className: "lp-menu", role: "menu", style: pos, onContextMenu: (e) => e.preventDefault() },
			items.filter(Boolean).map((it, i) =>
				h(
					"button",
					{
						key: i,
						role: it.checked === undefined ? "menuitem" : "menuitemradio",
						"aria-checked": it.checked,
						className: `lp-menu-item ${it.checked ? "is-checked" : ""} ${it.divider ? "has-divider" : ""}`,
						disabled: it.disabled,
						onClick: () => (onClose(), it.onClick()),
					},
					h("span", null, it.label),
					it.checked && h(Icon, { name: "check" })
				)
			)
		),
		document.body
	);
}

// [open(event, items), element]: open() shows the menu at the mouse (right-click) or under the button (click, keyboard);
// opening it again from the same button closes it.
function useMenu() {
	const [m, setM] = useState(null);
	const open = useCallback((e, items) => {
		e.preventDefault();
		const trigger = e.currentTarget;
		const r = (e.type === "contextmenu" && e.target.closest?.("[data-menu]")) || trigger;
		const box = r.getBoundingClientRect();
		const atMouse = e.type === "contextmenu" && e.clientX;
		setM((cur) => (cur && cur.trigger === trigger && e.type === "click" ? null : { trigger, items, x: atMouse ? e.clientX : box.left, y: atMouse ? e.clientY : box.bottom + 4 }));
	}, []);
	return [open, m && h(PopMenu, { ...m, onClose: () => setM(null) })];
}

// Spotify-style sort button: the current sorting as text, a menu with the choices and a check on the current one.
function SortMenu({ t, value, onChange, sorts }) {
	const [open, menu] = useMenu();
	const label = t(SORT_LABEL[value] ?? "sortAdded");
	const items = Object.keys(sorts).map((k) => ({ label: t(SORT_LABEL[k]), checked: k === value, onClick: () => onChange(k) }));
	return h(
		React.Fragment,
		null,
		h("button", { className: "lp-sortbtn", onClick: (e) => open(e, items), title: t("sortBy", label), "aria-label": t("sortBy", label), "aria-haspopup": "menu" }, h("span", null, label), h(Icon, { name: "list-view" })),
		menu
	);
}

// Spotify-style search: a magnifier that opens into a field, closes again when left empty.
function SearchBox({ t, value, onChange }) {
	const [open, setOpen] = useState(!!value);
	const ref = useRef();
	const show = open || !!value;
	useEffect(() => {
		if (open) ref.current?.focus();
	}, [open]);
	return h(
		"div",
		{ className: `lp-searchbox ${show ? "is-open" : ""}` },
		h("button", { className: "lp-icon-btn", title: t("search"), "aria-label": t("search"), onClick: () => (show ? ref.current?.focus() : setOpen(true)) }, h(Icon, { name: "search" })),
		h("input", {
			ref,
			className: "lp-search",
			type: "search",
			placeholder: t("search"),
			value,
			tabIndex: show ? 0 : -1,
			"aria-label": t("search"),
			onChange: (e) => onChange(e.target.value),
			onBlur: () => !value && setOpen(false),
			onKeyDown: (e) => e.key === "Escape" && (onChange(""), setOpen(false), e.currentTarget.blur()),
		})
	);
}

// Mood chips on one line; "More" unfolds the rest when they don't fit.
function MoodRow({ t, label, children }) {
	const ref = useRef();
	const [open, setOpen] = useState(false);
	const [multi, setMulti] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const check = () => {
			const c = el.children;
			setMulti(c.length > 1 && c[c.length - 1].offsetTop > c[0].offsetTop);
		};
		check();
		const ro = new ResizeObserver(check);
		ro.observe(el);
		return () => ro.disconnect();
	}, [children.length]);
	return h(
		"div",
		{ className: "lp-moodrow" },
		h("span", { className: "lp-muted" }, label),
		h("div", { ref, className: `lp-moodchips ${open ? "is-open" : ""}` }, children),
		multi && h("button", { className: "lp-link lp-muted lp-moods-toggle", onClick: () => setOpen(!open), "aria-expanded": open }, t(open ? "moodsLess" : "moodsMore"))
	);
}

// One right-click menu for a whole list instead of one per row (200 rows each with their own menu took ~0.1 s to draw).
// The row is found by its data-menu key. menuFor(key) returns our menu items, or a Spotify menu element (AlbumMenu),
// which Spotify's handler opens when given as its 2nd argument.
function SharedMenu({ className, menuFor, children }) {
	const { RightClickMenu } = Spicetify.ReactComponent;
	const [open, menu] = useMenu();
	const box = (onContextMenu, ref) =>
		h(
			"div",
			{
				className,
				ref,
				onContextMenu: (e) => {
					const key = e.target.closest("[data-menu]")?.dataset.menu;
					const m = key && menuFor(key);
					if (Array.isArray(m)) open(e, m);
					else if (m && onContextMenu) onContextMenu(e, h(Boundary, { fallback: null }, m));
				},
			},
			children,
			menu
		);
	if (!RightClickMenu) return box();
	return h(Boundary, { fallback: box() }, h(RightClickMenu, { menu: h("div") }, (isOpen, onContextMenu, ref) => box(onContextMenu, ref)));
}

// Menu of an album on the Listen later shelf.
const laterItems = (LP, uri, last) => [
	last && { label: LP.t("resume", "").replace(/[:\s]+$/, ""), onClick: () => LP.playLaterFrom(uri, last.uri, last.pos) },
	{ label: LP.t(last ? "fromStart" : "playAlbum"), onClick: () => LP.playUri(uri) },
	last && { label: LP.t("resetProgress"), onClick: () => LP.resetLaterProgress(uri) },
	{ label: LP.t("toAlbums"), onClick: () => LP.toAlbums(uri), divider: true },
	{ label: LP.t("removeLater"), onClick: () => LP.removeLater(uri) },
	{ label: LP.t("openAlbum"), onClick: () => go(uri), divider: true },
];

// Menu of a track row. play(uri) plays from it; exclude is given on the Tracks tab only.
function trackItems(LP, liked, { uri, artists, album }, play, exclude) {
	const P = Spicetify.Platform;
	const isLiked = liked?.has(uri);
	const link = `https://open.spotify.com/track/${uri.split(":")[2]}`;
	return [
		{ label: LP.t("playAlbum"), onClick: () => play(uri) },
		{ label: LP.t("addToQueue"), onClick: () => P.PlayerAPI.addToQueue([{ uri }]).then(() => Spicetify.showNotification(LP.t("addedToQueue"))) },
		{ label: LP.t(isLiked ? "unlike" : "like"), onClick: () => P.LibraryAPI[isLiked ? "remove" : "add"]({ uris: [uri] }), divider: true },
		exclude && { label: LP.t("excludeTrack"), onClick: exclude },
		artists?.[0]?.uri && { label: LP.t("goArtist"), onClick: () => go(artists[0].uri), divider: true },
		album?.uri && { label: LP.t("openAlbum"), onClick: () => go(album.uri) },
		{ label: LP.t("copyLink"), onClick: () => (P.ClipboardAPI?.copy(link) ?? navigator.clipboard.writeText(link)).then?.(() => Spicetify.showNotification(LP.t("linkCopied"))), divider: true },
	];
}

// Spotify-style album tile: cover, title, "Single • artist", a round ▶ on hover. Click opens it, right-click for the menu.
// On the Listen later shelf (onOpen given) a tile shows listening progress and opens the album view.
const AlbumCard = memo(function AlbumCard({ t, onOpen, onPlay, uri, name, artists, images, albumType, total, heard, last }) {
	const kind = albumType === "single" ? `${t("single")} • ` : albumType === "ep" ? "EP • " : "";
	const sub = kind + names(artists) + (onOpen && heard ? ` • ${t("progressOf", heard, total)}` : "");
	const open = onOpen ? () => onOpen(uri) : () => go(uri);
	const tip = last ? t("resume", "").replace(/[:\s]+$/, "") : t("playAlbum");
	return h(
		"div",
		{ className: "lp-card", "data-menu": uri, role: "link", tabIndex: 0, onClick: open, onKeyDown: (e) => e.key === "Enter" && open() },
		h(
			"div",
			{ className: "lp-card-cover" },
			h("img", { src: img(images, "standard"), alt: "", loading: "lazy" }),
			onOpen && (heard || last) ? h("div", { className: "lp-progress" }, h("div", { style: { width: `${Math.round((heard / Math.max(total, 1)) * 100)}%` } })) : null,
			h(
				"button",
				{ className: "lp-card-play", title: tip, "aria-label": `${tip}: ${name}`, onClick: (e) => (e.stopPropagation(), onPlay(uri, last)), onKeyDown: (e) => e.stopPropagation() },
				h(Icon, { name: "play", size: 20 })
			)
		),
		h("div", { className: "lp-card-name", title: name }, name),
		h("div", { className: "lp-card-artist", title: sub }, sub)
	);
});

// A row of the Tracks tab. Memoized: when the song changes or a row is removed, only the rows that changed redraw.
const TrackRow = memo(function TrackRow({ tr, i, t, now, onPlay, onExclude }) {
	return h(
		"div",
		{
			"data-menu": tr.uid || tr.uri,
			className: `lp-row ${tr.isPlayable ? "" : "is-disabled"} ${now ? "is-playing" : ""}`,
			role: "button",
			tabIndex: 0,
			title: t("rowTitle"),
			onDoubleClick: () => onPlay(tr.uri),
			onKeyDown: (e) => e.key === "Enter" && onPlay(tr.uri),
		},
		h(RowNum, { n: i + 1, t, now, label: t("playTrack", tr.name), onPlay: () => onPlay(tr.uri) }),
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
				onClick: (e) => (e.stopPropagation(), onExclude(tr)),
				onDoubleClick: (e) => e.stopPropagation(),
			},
			h(Icon, { name: "x" })
		)
	);
});

// Column titles above the track list, like Spotify's; clicking one sorts by it, clicking it again goes back to date added.
function TrackHead({ t, sort, setSort }) {
	const col = (key, content, className = "") =>
		h(
			"button",
			{ className: `lp-th ${className} ${sort === key && key !== "added" ? "is-active" : ""}`, onClick: () => setSort(sort === key && key !== "added" ? "added" : key), title: t("sortBy", t(SORT_LABEL[key])) },
			content
		);
	return h(
		"div",
		{ className: "lp-thead" },
		col("added", "#", "lp-th-num"),
		h("span"),
		col("name", t("sortName")),
		col("album", t("sortAlbum")),
		col("duration", h(Icon, { name: "clock" }), "lp-th-dur"),
		h("span")
	);
}

// Header of an album opened inside a tab: back, title (opens the album in Spotify when uri is given), a line under it,
// actions on the right.
function SubHead({ t, close, title, uri, sub, children }) {
	return h(
		"div",
		{ className: "lp-subhead" },
		h(BackBtn, { t, onClick: close }),
		h(
			"div",
			{ className: "lp-subhead-text" },
			uri ? h("button", { className: "lp-removed-title lp-title-link", onClick: () => go(uri), title: t("openAlbum") }, title) : h("span", { className: "lp-removed-title" }, title),
			sub && h("span", { className: "lp-muted" }, sub)),
		h("div", { className: "lp-push lp-later-actions" }, children)
	);
}

// Listen later album view: every track with a mark for listened ones and for where you stopped, plus Continue.
function LaterAlbum({ LP, album, ver, close, liked }) {
	const { t } = LP;
	const now = usePlaying();
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
			SubHead,
			{ t, close, title: album.name, uri: album.uri, sub: [names(album.artists), d && albumTime(t, d.tracks.reduce((n, tr) => n + (tr.duration ?? 0), 0)), d && t("heardOf", heard, d.tracks.length)].filter(Boolean).join(" · ") },
			lastTrack
				? h(Btn, { icon: "play", className: "is-primary", label: t("resume", `${lastTrack.name} (${time(d.last.pos) || "0:00"})`), onClick: () => LP.playLaterFrom(album.uri, d.last.uri, d.last.pos) })
				: h(Btn, { icon: "play", className: "is-primary", label: t("playAlbum"), onClick: () => d?.tracks[0] && LP.playLaterFrom(album.uri, d.tracks[0].uri) }),
			lastTrack && h(Btn, { label: t("fromStart"), onClick: () => d?.tracks[0] && LP.playLaterFrom(album.uri, d.tracks[0].uri) }),
			d?.last && h(Btn, { label: t("resetProgress"), onClick: () => LP.resetLaterProgress(album.uri) })
		),
		h(
			SharedMenu,
			{
				className: "lp-list",
				menuFor: (uri) => trackItems(LP, liked, { uri, album }, (u) => LP.playLaterFrom(album.uri, u)),
			},
			(d?.tracks ?? []).map((tr, i) =>
				h(
					"div",
					{
						key: tr.uri,
						"data-menu": tr.uri,
						className: `lp-row lp-row-later ${d.heard[tr.uri] ? "is-heard" : ""} ${tr.playable ? "" : "is-disabled"} ${now.uri === tr.uri ? "is-playing" : ""}`,
						role: "button",
						tabIndex: 0,
						title: t("rowTitle"),
						onDoubleClick: () => LP.playLaterFrom(album.uri, tr.uri),
						onKeyDown: (e) => e.key === "Enter" && LP.playLaterFrom(album.uri, tr.uri),
					},
					h(RowNum, { n: i + 1, t, now: now.uri === tr.uri ? now : null, label: t("playTrack", tr.name), onPlay: () => LP.playLaterFrom(album.uri, tr.uri) }),
					h("span", { className: "lp-heard", title: d.heard[tr.uri] ? t("heardTrack") : "" }, d.heard[tr.uri] ? h(Icon, { name: "check" }) : null),
					h("img", { src: img(album.images, "small"), alt: "", loading: "lazy" }), // the album cover, like the Tracks tab rows
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
	const all = groups.flatMap((g) => g.items.map((it) => it.uri));
	if (!all.length) return h(Empty, { icon: "x", title: t("nothingRemoved"), text: t("removeHint") });
	if (!open)
		return h(
			React.Fragment,
			null,
			h(
				"div",
				{ className: "lp-moods" },
				h("span", { className: "lp-muted" }, t("removedHint")),
				all.length > 1 && h(Btn, { label: t("bringBackAll"), onClick: () => restore(all), className: "lp-push" })
			),
			h(
				SharedMenu,
				{
					className: "lp-grid",
					menuFor: (key) => {
						const g = groups.find((x) => (x.key || "-") === key);
						return g && [{ label: t("bringBackAlbum"), onClick: () => restore(g.items.map((it) => it.uri)) }, g.key && { label: t("openAlbum"), onClick: () => go(g.key) }];
					},
				},
				groups.map((g) =>
					h(
						"div",
						{ key: g.key, "data-menu": g.key || "-", className: "lp-card", role: "button", tabIndex: 0, onClick: () => setOpen(g.key), onKeyDown: (e) => e.key === "Enter" && setOpen(g.key) },
						g.image ? h("img", { src: cover(g.image), alt: "", loading: "lazy" }) : h("div", { className: "lp-card-blank" }, h(Icon, { name: "album", size: 48 })),
						h("div", { className: "lp-card-name", title: g.name }, g.name || t("otherAlbum")),
						h("div", { className: "lp-card-artist" }, [g.artist, count(g.items.length, "tracks")].filter(Boolean).join(" • "))
					)
				)
			)
		);
	return h(
		React.Fragment,
		null,
		h(
			SubHead,
			{ t, close: () => setOpen(null), title: open.name || t("otherAlbum"), uri: open.key || undefined, sub: open.artist },
			open.items.length > 1 && h(Btn, { label: t("bringBackAll"), onClick: () => restore(open.items.map((it) => it.uri)) })
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

// The last data shown, so reopening the page draws at once and refreshes in the background
let lastData = null;

function Page({ LP }) {
	const { t, count, state } = LP;
	const now = usePlaying();
	const pageRef = useRef();
	useTopBar(pageRef);
	const [ver, setVer] = useState(0);
	const [data, setData] = useState(() => lastData);
	const [error, setError] = useState(null);
	const [tab, setTab] = useState("tracks");
	const [query, setQuery] = useState("");
	const [mood, setMood] = useState(null);
	const [moodSet, setMoodSet] = useState(null);
	const [sort, setSort] = usePersisted("sort", "added");
	const [albumSort, setAlbumSort] = usePersisted("album-sort", "added");
	const [modePref, setModePref] = usePersisted("mode", "order");
	const [limit, setLimit] = useState(200);
	const [gone, setGone] = useState(() => new Set()); // rows hidden on click, until fresh data (which excludes them) arrives
	const [removedAlbum, setRemovedAlbum] = useState(null); // album opened inside the Removed tab
	const [laterAlbum, setLaterAlbum] = useState(null); // album opened inside the Listen later tab
	const [noLikedFlag, setNoLikedFlag] = usePersisted("no-liked", "0");
	const [openMenu, menuEl] = useMenu(); // the "…" menu
	const orderedRef = useRef(); // what "in order" plays right now, read by the rows' stable callbacks
	const onPlayRow = useCallback((uri) => LP.play("order", orderedRef.current, uri), []);
	const onExcludeRow = useCallback((tr) => (setGone((g) => new Set(g).add(tr.uri)), LP.excludeTrack(tr)), []);
	const noLiked = noLikedFlag === "1";
	const skipRef = useRef();
	// a tile's ▶: Listen later albums continue where you stopped; with "No Liked Songs" on, the album plays without them
	const onPlayCard = useCallback(
		(uri, last) => (last ? LP.playLaterFrom(uri, last.uri, last.pos) : skipRef.current ? LP.playAlbums("order", [uri], skipRef.current) : LP.playUri(uri)),
		[]
	);

	useEffect(() => {
		const f = () => setVer((v) => v + 1);
		LP.events.addEventListener("change", f);
		return () => LP.events.removeEventListener("change", f);
	}, []);
	useEffect(() => {
		let live = true;
		LP.load()
			.then((d) => ((lastData = d), live && (setData(d), setGone(new Set()), setError(null))))
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
	// First draw only what fits on screen, the rest right after. Decided during the render (an effect would run after
	// the expensive render), keyed by what the list shows.
	const listKey = [tab, query, mood?.tag, sort, noLikedFlag].join('|');
	const [painted, setPainted] = useState({ key: listKey, n: FIRST_ROWS });
	const paint = painted.key === listKey ? painted.n : FIRST_ROWS;
	useEffect(() => {
		if (paint >= limit) return;
		const id = setTimeout(() => setPainted({ key: listKey, n: limit }), 0);
		return () => clearTimeout(id);
	}, [listKey, paint, limit]);

	if (!data) return h("section", { className: "lp-page", ref: pageRef }, h("p", { className: "lp-muted" }, error ? t("error", error) : t("loading")));

	const q = query.trim().toLowerCase();
	const match = (...s) => !q || s.some((x) => x?.toLowerCase().includes(q));
	const skip = noLiked ? data.liked : null; // liked tracks hidden and not played while "No Liked Songs" is on
	skipRef.current = skip;
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
	orderedRef.current = ordered;
	const shelf = tab === "albums" ? albums : tab === "later" ? later : null;
	const laterOpen = tab === "later" ? data.later.find((a) => a.uri === laterAlbum) : null;
	const removedGroups = groupRemoved(data.removed.filter((it) => !gone.has(it.uri) && match(it.name, it.artist, it.albumName)));
	const removedOpen = removedGroups.find((g) => g.key === removedAlbum);
	const removedUris = (removedOpen ? removedOpen.items : removedGroups.flatMap((g) => g.items)).map((it) => it.uri);
	const restore = (list) => (setGone(new Set([...gone, ...list])), LP.restoreTracks(list));
	const mode = modePref === "smart" && !data.canSmart ? "order" : modePref;
	const nextMode = () => {
		let i = MODES.indexOf(mode);
		do i = (i + 1) % MODES.length;
		while (MODES[i] === "smart" && !data.canSmart);
		setModePref(MODES[i]);
	};
	// ▶ plays what the open tab shows
	const playTab = () =>
		tab === "removed"
			? LP.play(mode, removedUris)
			: !shelf
			? LP.play(mode, mode === "order" ? ordered : subset)
			: tab === "later" && !laterOpen && !q && !skip && !ALBUM_SORTS[albumSort] && later.length
				? LP.play(mode, undefined, undefined, "later") // the whole later playlist as it is
				: LP.playAlbums(mode, (laterOpen ? [laterOpen] : shelf).map((a) => a.uri), skip);
	const what =
		tab === "removed"
			? count(removedUris.length, "tracks")
			: laterOpen
			? laterOpen.name
			: shelf
			? count(shelf.length, "albums") + (skip ? t("exceptLiked") : "")
			: count(uris.length, "tracks");
	const canPlay = tab === "removed" ? removedUris.length > 0 : laterOpen ? true : shelf ? shelf.length > 0 : uris.length > 0;
	const resetFilters = () => (setQuery(""), setMood(null), setNoLikedFlag("0"));

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

	const moreItems = [
		{ label: t("openPlaylist"), onClick: () => go(data.playlist) },
		hasSortPlay() && { label: t("sortPlayMenu"), onClick: () => openSortPlay(tab === "later" && data.laterPlaylist ? data.laterPlaylist : data.playlist) },
		{ label: t("syncNow"), onClick: () => LP.sync(), disabled: state.syncing },
	];
	const modeTip = t("modeTitle", t(MODE_LABEL[mode]));
	const playTip = t("playWhat", what) + (mode === "order" ? "" : ` · ${t(MODE_LABEL[mode])}`);
	const sortFor = tab === "tracks" ? [sort, setSort, SORTS] : shelf && !laterOpen ? [albumSort, setAlbumSort, ALBUM_SORTS] : null;
	const actions = h(
		"div",
		{ className: "lp-actions" },
		h("button", { className: "lp-play", onClick: playTab, disabled: !canPlay, title: playTip, "aria-label": playTip }, h(Icon, { name: "play", size: 24 })),
		h(
			"button",
			{ className: `lp-icon-btn lp-mode ${mode === "order" ? "" : "is-on"}`, onClick: nextMode, title: modeTip, "aria-label": modeTip },
			h(Icon, { name: MODE_ICON[mode], size: 24 }),
			mode === "shuffle+" && h("b", { className: "lp-mode-plus", "aria-hidden": true }, "+")
		),
		h("button", { className: "lp-icon-btn", onClick: (e) => openMenu(e, moreItems), title: t("moreActions"), "aria-label": t("moreActions"), "aria-haspopup": "menu" }, h(Icon, { name: "more", size: 24 })),
		menuEl,
		h(Btn, { icon: "heart", label: t("noLiked"), title: t("noLikedTitle"), onClick: () => setNoLikedFlag(noLiked ? "0" : "1"), pressed: noLiked, className: "lp-push" }),
		h(SearchBox, { t, value: query, onChange: setQuery }),
		sortFor && h(SortMenu, { t, value: sortFor[0], onChange: sortFor[1], sorts: sortFor[2] })
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
	const noResults = h(Empty, {
		icon: "search",
		title: q ? t("noResults", query.trim()) : t("noMatch"),
		action: h(Btn, { label: t("resetFilters"), onClick: resetFilters }),
	});

	let body;
	if (tab === "tracks") {
		const moods =
			data.tags.length > 0 &&
			h(
				MoodRow,
				{ t, label: t("mood") },
				data.tags.map((m) =>
					h("button", { key: m.tag, className: `lp-mood ${mood?.tag === m.tag ? "is-active" : ""}`, "aria-pressed": mood?.tag === m.tag, onClick: () => setMood(mood?.tag === m.tag ? null : m) }, m.name)
				)
			);
		const shown = tracks.slice(0, Math.min(limit, paint));
		const rows = shown.map((tr, i) => h(TrackRow, { key: tr.uid || tr.uri, tr, i, t, now: now.uri === tr.uri ? now : null, onPlay: onPlayRow, onExclude: onExcludeRow }));
		const trackMenu = (key) => {
			const tr = shown.find((x) => (x.uid || x.uri) === key);
			return tr && trackItems(LP, data.liked, tr, onPlayRow, () => onExcludeRow(tr));
		};
		body = h(
			React.Fragment,
			null,
			moods,
			mood && !moodSet
				? h("p", { className: "lp-muted lp-hint" }, t("picking"))
				: tracks.length
				? h(React.Fragment, null, h(TrackHead, { t, sort, setSort }), h(SharedMenu, { className: "lp-list", menuFor: trackMenu }, rows))
				: noResults,
			tracks.length > limit && h(Btn, { label: t("more", tracks.length - limit), onClick: () => setLimit(limit + 200), className: "lp-more" })
		);
	} else if (laterOpen) {
		body = h(LaterAlbum, { LP, album: laterOpen, ver, liked: data.liked, close: () => setLaterAlbum(null) });
	} else if (tab === "removed") {
		body = h(RemovedTab, { LP, groups: removedGroups, open: removedOpen, setOpen: setRemovedAlbum, restore });
	} else if (!shelf.length) {
		const source = tab === "later" ? data.later : data.albums;
		body = source.length
			? noResults
			: h(Empty, { icon: "album", title: t(tab === "later" ? "emptyLaterTitle" : "emptyAlbumsTitle"), text: t(tab === "later" ? "emptyLater" : "emptyAlbums") });
	} else {
		const grid = (list) =>
			h(
				SharedMenu,
				{
					className: "lp-grid",
					menuFor: (uri) => {
						const a = shelf.find((x) => x.uri === uri);
						const { AlbumMenu } = Spicetify.ReactComponent;
						if (!a) return null;
						return tab === "later" ? laterItems(LP, uri, a.last) : AlbumMenu && h(AlbumMenu, { uri, artistUri: a.artists?.[0]?.uri });
					},
				},
				list.map((a) => h(AlbumCard, { key: a.uri, t, onOpen: tab === "later" ? setLaterAlbum : null, onPlay: onPlayCard, ...a }))
			);
		// Listen later: albums you have started come first, in their own block, the most recently played first
		const started = tab === "later" ? shelf.filter((a) => a.heard || a.last) : [];
		if (!ALBUM_SORTS[albumSort]) started.sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));
		const rest = started.length ? shelf.filter((a) => !started.includes(a)) : shelf;
		body = started.length
			? h(
					React.Fragment,
					null,
					h("h2", { className: "lp-section" }, t("laterStarted")),
					grid(started),
					rest.length > 0 && h("h2", { className: "lp-section" }, t("laterNew")),
					rest.length > 0 && grid(rest)
				)
			: grid(shelf);
	}

	return h("section", { className: "lp-page", ref: pageRef }, header, actions, tabs, body);
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
