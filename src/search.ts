const MATCHES_PER_LOAD: number = 100;

enum Filter {
	EQUAL = 0,
	LESS_EQUAL = -1,
	LESS = -2,
	GREATER_EQUAL = 1,
	GREATER = 2,
}
namespace Filter {
	export const from_str = (value: string): Filter | null => {
		return {
			"equal": Filter.EQUAL,
			"less_equal": Filter.LESS_EQUAL,
			"less": Filter.LESS,
			"greater_equal": Filter.GREATER_EQUAL,
			"greater": Filter.GREATER,
		}[value] ?? null;
	}
};
interface VsResult {
	total: number,
	wins: number,
	draws: number,
	losses: number,
	win_completions: number,
	loss_completions: number,
	win_completions_time: number,
	loss_completions_time: number,
	win_average: number | null,
	loss_average: number | null,
	elo_change: number,
	opponent: Player,
};
type SortBy = [keyof VsResult, boolean];
type FilterBy = [keyof VsResult, Filter, number];

const total: {
	uuid: string | null,
	nickname: string | null,
	loading: boolean,
	num_loaded: number,
	before: number | null,
	after: number,
	datas: Record<string, {
		matches: Match[],
		opponent: Player,
	}>,
	results: Record<string, VsResult>,
	sort_by: [SortBy, ...SortBy[]],
	filter_by: [FilterBy, ...FilterBy[]],
} = {
	uuid: null,
	nickname: null,
	loading: true,
	num_loaded: 0,
	before: null,
	after: 0,
	datas: {},
	results: {},
	sort_by: [
		["total", true],
		["total", true],
	],
	filter_by: [
		["total", Filter.GREATER, 1],
	]
};

const time_to_string = (time: number) => {
	time = Math.floor(time);
	let minutes = Math.floor(time / 60),
		seconds = (time % 60).toString().padStart(2, "0");
	return `${minutes}:${seconds}`;
}

window.addEventListener("load", () => {
	const params = new URLSearchParams(window.location.search);
	const username = params.get("username");
	if (username === null) {
		window.location.assign("./index.html");
		return;
	}

	const opponents = document.getElementById("opponents") as HTMLDivElement;
	opponent_card_node = opponents.children[0] as HTMLDivElement;
	opponents.replaceChildren();
	opponent_card_node.style.display = "";

	const opponent_matches = opponent_card_node.querySelector(".opponent_matches") as HTMLDivElement;
	opponent_match_node = opponent_matches.children[0] as HTMLAnchorElement | undefined;
	opponent_matches.replaceChildren();

	document.getElementById("sort_select")?.addEventListener("change", on_sort_change);
	document.getElementById("sort_direction")?.addEventListener("click", on_sort_direction_change);
	document.getElementById("filter_select_id")?.addEventListener("change", on_filter_change);
	document.getElementById("filter_select_cmp")?.addEventListener("change", on_filter_change);
	document.getElementById("filter_select_value")?.addEventListener("change", on_filter_change);

	load_url(params);
	fetch_player(username);
});

type Callback = (json: any) => any;
const fetch_json = (url: string, callback: Callback) => {
	fetch(url).then((res) => res.json().then(callback).catch(fetch_error)).catch(fetch_error);
}

const fetch_player = (user: string) => {
	const user_url = `https://api.mcsrranked.com/users/${user}`;
	fetch_json(user_url, parse_user);
}

const fetch_error = (err: string | null) => {
	if (err === "User is not exists.") {
		alert("User does not exist! Please try a different username");
		window.location.assign("./index.html");
		return;
	}
	alert("An error occurred! Check console for more info");
	console.error(err);
}

type ApiResponse<T> = {
	status: "error",
	data: string | null,
} | {
	status: "success"
	data: T | null,
};

interface Player {
	uuid: string,
	nickname: string,
	eloRate: number | null,
}

const parse_user = (res: ApiResponse<any>) => {
	if (res.status === "error")
		return fetch_error(res.data);

	const player = res.data;
	if (player === null)
		return fetch_error("Response data is null");

	display_player(player);

	load_cache();
	get_matches();
}

const display_player = (player: Player) => {
	total.uuid = player.uuid;
	total.nickname = player.nickname;
	const username_span = document.getElementById("username") as HTMLSpanElement;
	const user_avatar_img = document.getElementById("user_avatar") as HTMLImageElement;
	const user_elo_span = document.getElementById("user_elo") as HTMLSpanElement;
	username_span.innerText = player.nickname;
	user_avatar_img.src = `https://mineskin.eu/helm/${player.uuid}`;
	user_elo_span.innerText = player.eloRate === null ? "Unrated" : `${player.eloRate} ELO`;
}

const load_cache = () => {
	const CURRENT_VERSION = "2";
	const prev_version = localStorage.getItem("version");

	if (prev_version !== CURRENT_VERSION) {
		localStorage.clear();
		localStorage.setItem("version", CURRENT_VERSION);
		return;
	}

	total.after = parseInt(localStorage.getItem(`after_${total.uuid}`) ?? "0");
	if (isNaN(total.after))
		total.after = 0;
	total.results = JSON.parse(localStorage.getItem(`results_${total.uuid}`) ?? "{}");
	total.num_loaded = Object.values(total.results).reduce((partial, curr) => partial + curr.total, 0);
}

const update_loading_status = () => {
	const text = total.loading ?
		`Loading ${total.num_loaded} matches...` :
		`Loaded ${total.num_loaded} matches`;
	const loading_status = document.getElementById("loading_status") as HTMLSpanElement;
	loading_status.innerText = text;
}

const get_matches = () => {
	let matches_url = `https://api.mcsrranked.com/users/${total.uuid}/matches?count=${MATCHES_PER_LOAD}&excludedecay=true&type=2`;
	if (total.before !== null)
		matches_url += `&before=${total.before}`;
	if (total.after !== null)
		matches_url += `&after=${total.after}`;

	total.num_loaded += MATCHES_PER_LOAD;
	fetch_json(matches_url, got_matches);
	update_loading_status();
}

interface Match {
	id: number,
	forfeited: boolean,
	players: Player[],
	result: {
		uuid: string,
		time: number,
	},
	changes: {
		uuid: string,
		change: number,
	}[]
};

const got_matches = (res: ApiResponse<Match[]>) => {
	if (res.status === "error")
		return fetch_error(res.data);

	const new_matches = res.data;
	if (new_matches === null)
		return fetch_error("Response data is null");

	total.num_loaded -= MATCHES_PER_LOAD;

	for (const match of new_matches) {
		const opponent = match.players.find((o: Player) => o.uuid != total.uuid);
		if (opponent === undefined || opponent.uuid === undefined) {
			console.warn("Could not find opponent in match", match);
			continue;
		}
		total.num_loaded += 1;

		const curr_data = total.datas[opponent.uuid];
		if (curr_data) {
			curr_data.matches.push(match);
			curr_data.opponent = opponent;
		} else
			total.datas[opponent.uuid] = {
				opponent,
				matches: [match],
			};

		if (total.before === null || total.before > match.id)
			total.before = match.id;
	}

	if (new_matches.length >= MATCHES_PER_LOAD)
		get_matches();
	else
		finished_loading();

	update_loading_status();
}

const finished_loading = () => {
	total.loading = false;
	process_datas();
	display_opponents();
}

const process_datas = () => {
	for (const [opp_uuid, data] of Object.entries(total.datas)) {
		if (!(opp_uuid in total.results)) {
			total.results[opp_uuid] = {
				total: 0,
				wins: 0,
				draws: 0,
				losses: 0,
				win_completions: 0,
				loss_completions: 0,
				win_completions_time: 0,
				loss_completions_time: 0,
				win_average: null,
				loss_average: null,
				elo_change: 0,
				opponent: {} as Player,
			};
		}
		let result = total.results[opp_uuid] as VsResult;
		result.opponent = data.opponent;

		for (const match of data.matches) {
			const won = match.result?.uuid === total.uuid;
			const drew = match.result?.uuid === null;
			const completed = !match.forfeited;
			const elo_change = match.changes.find((ch) => ch.uuid === total.uuid)?.change;
			if (elo_change === undefined) {
				console.warn("Expected ELO change for user, found:", match.changes);
				continue;
			}

			result.total += 1;
			if (won) {
				result.wins += 1;
				if (completed) {
					result.win_completions += 1;
					result.win_completions_time += match.result?.time ?? 0;
				}
			} else if (drew) {
				result.draws += 1;
			} else {
				result.losses += 1;
				if (completed) {
					result.loss_completions += 1;
					result.loss_completions_time += match.result?.time ?? 0;
				}
			}
			result.elo_change += elo_change;

			if (match.id > total.after)
				total.after = match.id;
		}
	}
	save_cache();

	for (const result of Object.values(total.results)) {
		result.win_average = result.win_completions > 0 ?
			Math.round(result.win_completions_time / result.win_completions / 1000)
			: null;
		result.loss_average = result.loss_completions > 0 ?
			Math.round(result.loss_completions_time / result.loss_completions / 1000)
			: null;
	}
}

const save_cache = () => {
	localStorage.setItem(`after_${total.uuid}`, total.after.toString());
	localStorage.setItem(`results_${total.uuid}`, JSON.stringify(total.results));
}

let opponent_card_node: HTMLDivElement | undefined = undefined;
const display_opponents = () => {
	const opp_card_node = opponent_card_node;
	if (opp_card_node === undefined) {
		console.error("Cound not find opponent card node, exiting...");
		return;
	}
	const opponents = document.getElementById("opponents") as HTMLDivElement;
	opponents.replaceChildren();

	let results = filter_results(Object.values(total.results));
	results = sort_results(results);

	const opponent_nodes = results.map((result: VsResult) => {
		let win_time = "--", loss_time = "--";

		if (result.win_average !== null)
			win_time = time_to_string(result.win_average);
		if (result.loss_average !== null)
			loss_time = time_to_string(result.loss_average);

		const new_card_node = opp_card_node.cloneNode(true) as HTMLDivElement;

		(new_card_node.querySelector(".opponent_avatar") as HTMLImageElement).src = `https://mineskin.eu/helm/${result.opponent.uuid}`;
		const opp_name = new_card_node.querySelector(".opponent_username") as HTMLAnchorElement;
		opp_name.innerText = result.opponent.nickname;
		opp_name.href = `./search.html?username=${result.opponent.nickname}`;

		const win_draw_loss = new_card_node.querySelector(".win_draw_loss") as HTMLSpanElement;
		(win_draw_loss.querySelector(".wins.counter") as HTMLElement).innerText = result.wins.toString();
		(win_draw_loss.querySelector(".draws.counter") as HTMLElement).innerText = result.draws.toString();
		(win_draw_loss.querySelector(".losses.counter") as HTMLElement).innerText = result.losses.toString();

		const averages = new_card_node.querySelector(".averages") as HTMLSpanElement;
		(averages.querySelector(".wins.counter") as HTMLElement).innerText = win_time;
		(averages.querySelector(".losses.counter") as HTMLElement).innerText = loss_time;

		const elo_change = new_card_node.querySelector(".elo_change") as HTMLSpanElement;
		if (result.elo_change > 0) {
			elo_change.classList.add("wins");
			elo_change.innerText = `+${result.elo_change} ELO`;
		} else if (result.elo_change < 0) {
			elo_change.classList.add("losses");
			elo_change.innerText = `${result.elo_change} ELO`;
		} else {
			elo_change.classList.add("draws");
			elo_change.innerText = `${result.elo_change} ELO`;
		}

		(new_card_node.querySelector(".opponent_link") as HTMLAnchorElement).href = `https://mcsrranked.com/stats/${total.nickname}/vs/${result.opponent.nickname}`;

		(new_card_node.querySelector(".opponent_expand") as HTMLDivElement).addEventListener("click", on_opponent_expand.bind(undefined, result.opponent.nickname));

		return new_card_node;
	});

	opponents.replaceChildren(...opponent_nodes);
}

const filter_results = (result_values: VsResult[]): VsResult[] => {
	return result_values.filter((res: any) => {
		filters: for (const [id, cmp, value] of total.filter_by) {
			if (res[id] === null)
				return false;

			switch (cmp) {
				case Filter.EQUAL:
					if (res[id] == value)
						continue filters;
					break;

				case Filter.LESS:
					if (res[id] < value)
						continue filters;
					break;

				case Filter.LESS_EQUAL:
					if (res[id] <= value)
						continue filters;
					break;

				case Filter.GREATER:
					if (res[id] > value)
						continue filters;
					break;

				case Filter.GREATER_EQUAL:
					if (res[id] >= value)
						continue filters;
					break;

				default:
					console.warn(`Filter operation ${cmp} doesn't exist!`);
					continue filters;
			}

			return false;
		}

		return true;
	})
}

const sort_results = (result_values: VsResult[]) => {
	return result_values.sort((r1, r2) => {
		for (const [id, reverse] of total.sort_by) {
			if (id === "opponent") {
				console.warn("Cannot sort by opponent");
				continue;
			}
			const v1 = r1[id], v2 = r2[id];

			if (v1 === v2)
				continue;
			if (v1 === null)
				return 1;
			if (v2 === null)
				return -1;

			return (v1 - v2) * (reverse ? -1 : 1);
		}
		return 0;
	});
}

const
	FILTER_BY_PARAM = "fb",
	FILTER_VALUE_PARAM = "fv",
	FILTER_CMP_PARAM = "fc",
	SORT_BY_PARAM = "sb",
	SORT_DIR_PARAM = "sd";

const update_url = (param: string, value: any) => {
	let params = new URLSearchParams(window.location.search);
	params.set(param, value);
	history.replaceState(null, "", `?${params.toString()}`);
}

const load_url = (params: URLSearchParams) => {
	const id_to_index = (value: string) => {
		return [
			"total",
			"wins",
			"win_completions",
			"losses",
			"loss_completions",
			"draws",
			"elo_change",
			"win_average",
			"loss_average",
		].findIndex((v) => v == value);
	}
	const cmp_to_index = (value: number): number => {
		return [
			3,
			4,
			0,
			2,
			1,
		][value + 2] as number;
	}

	const filter_by_id = params.get(FILTER_BY_PARAM) as keyof VsResult | null;
	if (filter_by_id !== null) {
		total.filter_by[0][0] = filter_by_id;
		const filter_select_id = document.getElementById("filter_select_id") as HTMLSelectElement;
		filter_select_id.selectedIndex = id_to_index(filter_by_id);
	}

	const filter_cmp_id = params.get(FILTER_CMP_PARAM) as keyof VsResult | null;
	if (filter_cmp_id !== null) {
		let val = parseInt(filter_cmp_id);
		val = isNaN(val) ? 1 : val;
		total.filter_by[0][1] = val;
		const filter_select_cmp = document.getElementById("filter_select_cmp") as HTMLSelectElement;
		filter_select_cmp.selectedIndex = cmp_to_index(val);
	}

	const filter_value = params.get(FILTER_VALUE_PARAM) as keyof VsResult | null;
	if (filter_value !== null) {
		let val = parseInt(filter_value);
		val = isNaN(val) ? 1 : val;
		total.filter_by[0][2] = val;
		const filter_select_value = document.getElementById("filter_select_value") as HTMLSelectElement;
		filter_select_value.value = val.toString();
	}

	const sort_by_id = params.get(SORT_BY_PARAM) as keyof VsResult | null;
	if (sort_by_id !== null) {
		total.sort_by[0][0] = sort_by_id;
		const sort_select = document.getElementById("sort_select") as HTMLSelectElement;
		sort_select.selectedIndex = id_to_index(sort_by_id);
	}

	const sort_dir = params.get(SORT_DIR_PARAM);
	if (sort_dir !== null) {
		const val = sort_dir == "1";
		total.sort_by[0][1] = val;
		const sort_direction = document.getElementById("sort_direction") as HTMLElement;
		sort_direction.style.transform = val ? "" : "scale(1, -1)";
	}

	console.log("Loaded", total.filter_by[0], total.sort_by[0]);
}

const on_filter_change = () => {
	const filter_by = (document.getElementById("filter_select_id") as HTMLInputElement | null)?.value as (keyof VsResult | null | undefined);
	if (filter_by == null)
		return;

	const filter_cmp_str = (document.getElementById("filter_select_cmp") as HTMLInputElement | null)?.value;
	if (filter_cmp_str == null)
		return;

	const filter_cmp = Filter.from_str(filter_cmp_str);
	if (filter_cmp === null)
		return;

	const filter_value_str = (document.getElementById("filter_select_value") as HTMLInputElement | null)?.value;
	if (filter_value_str == null)
		return;

	let filter_value = parseInt(filter_value_str);
	if (isNaN(filter_value)) {
		alert("Invalid filter value!");
		const filter_select_value = document.getElementById("filter_select_value") as HTMLSelectElement;
		filter_select_value.value = "1";
		filter_value = 1;
	}

	update_url(FILTER_BY_PARAM, filter_by);
	update_url(FILTER_CMP_PARAM, filter_cmp);
	update_url(FILTER_VALUE_PARAM, filter_value_str);

	total.filter_by[0] = [filter_by, filter_cmp, filter_value];
	display_opponents();
}

const on_sort_change = () => {
	const sort_select = document.getElementById("sort_select") as HTMLSelectElement;
	const sort_by = sort_select.value as keyof VsResult;
	if (sort_by === undefined)
		return;

	update_url(SORT_BY_PARAM, sort_by);

	total.sort_by[0][0] = sort_by;
	display_opponents();
}
const on_sort_direction_change = () => {
	const dir = !total.sort_by[0][1];
	total.sort_by[0][1] = dir;
	const sort_direction = document.getElementById("sort_direction") as HTMLElement;
	sort_direction.style.transform = dir ? "" : "scale(1, -1)";

	update_url(SORT_DIR_PARAM, +dir);

	display_opponents();
}

let opponent_match_node: HTMLAnchorElement | undefined = undefined;
const on_opponent_expand = (opp_nickname: string, e: HTMLElementEventMap["click"]) => {
	const target = e.target as HTMLElement;
	const opponent_matches: HTMLElement | undefined = target.parentElement?.parentElement?.querySelector(".opponent_matches") ?? undefined;
	if (opponent_matches === undefined) {
		console.warn("Cannot find opponent matches")
		return;
	}
	if (opponent_matches.style.display === "none") {
		opponent_matches.style.display = "";
		target.classList.add("expanded");
	} else {
		opponent_matches.style.display = "none";
		target.classList.remove("expanded");
	}

	const versus_url = `https://api.mcsrranked.com/users/${total.nickname}/versus/${opp_nickname}/matches?count=100&type=2`;
	fetch_json(versus_url, on_opponent_expand_response.bind(undefined, opponent_matches));
}
const on_opponent_expand_response = (opp_matches: HTMLElement, json: any) => {
	if (json.status !== "success")
		return fetch_error(json.data);

	const matches = json.data;
	if (!(matches instanceof Array)) {
		console.warn("Expected array of matches, got", matches);
		return;
	}

	const opp_match_node = opponent_match_node;
	if (opp_match_node === undefined) {
		console.warn("Cannot find opponent match");
		return;
	}

	const match_nodes = matches.map((match) => {
		const new_match_node = opp_match_node.cloneNode(true) as HTMLAnchorElement;
		new_match_node.href = `https://mcsrranked.com/stats/${total.nickname}/${match.id}?matches=ranked&sort=newest`

		const time_str = time_to_string(match.result.time / 1000);
		const time = new_match_node.querySelector(".match_time") as HTMLElement;
		time.innerText = time_str;
		time.classList.add(match.result.uuid === total.uuid ? "wins" : "losses");

		const FORFEIT_URL = "./static/forfeit.png";
		const COMPLETION_URL = "./static/completion.png";
		const forfeit_img = new_match_node.querySelector(".match_forfeit") as HTMLImageElement;
		forfeit_img.src = match.forfeited ? FORFEIT_URL : COMPLETION_URL;
		forfeit_img.title = match.forfeited ? "forfeited" : "completed";

		return new_match_node;
	});
	opp_matches.replaceChildren(...match_nodes);
}
