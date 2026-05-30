import { fetch_api, Match, Player, VsResult } from "./api.js";

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
type SortBy = [keyof VsResult, boolean];
type FilterBy = [keyof VsResult, Filter, number];

type VersusDatas = Record<string, {
	matches: Match[],
	opponent: Player,
}>;
type VersusResults = Record<string, VsResult>;
const sort_filter: {
	sort_by: [SortBy, ...SortBy[]],
	filter_by: [FilterBy, ...FilterBy[]],
} = {
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

window.addEventListener("load", async () => {
	const params = new URLSearchParams(window.location.search);
	const username = params.get("username");
	if (username === null) {
		window.location.assign("./index.html");
		return;
	}

	init_elements();
	document.getElementById("sort_select")?.addEventListener("change", on_sort_change);
	document.getElementById("sort_direction")?.addEventListener("click", on_sort_direction_change);

	load_url(params);
	const player = await fetch_player(username);
	display_player(player);

	const cache = load_cache(player.uuid);
	const new_matches = await get_matches(player.uuid, cache);
	const new_datas = matches_to_datas(player.uuid, new_matches.matches);

	const all_results = process_datas(player.uuid, cache?.results ?? {}, new_datas);
	save_cache(player.uuid, all_results, new_matches.new_after);
	display_opponents(player, all_results);

	const on_change = () => {
		on_filter_change();
		display_opponents(player, all_results);
	}
	document.getElementById("filter_select_id")?.addEventListener("change", on_change);
	document.getElementById("filter_select_cmp")?.addEventListener("change", on_change);
	document.getElementById("filter_select_value")?.addEventListener("change", on_change);
});

const init_elements = () => {
	const opponents = document.getElementById("opponents") as HTMLDivElement;
	opponent_card_node = opponents.children[0] as HTMLDivElement;
	opponents.replaceChildren();
	opponent_card_node.style.display = "";

	const opponent_matches = opponent_card_node.querySelector(".opponent_matches") as HTMLDivElement;
	opponent_match_node = opponent_matches.children[0] as HTMLAnchorElement | undefined;
	opponent_matches.replaceChildren();
}

const fetch_player = async (username: string): Promise<Player> => {
	const user_url = `https://api.mcsrranked.com/users/${username}`;
	return await fetch_api(user_url, `Could not find user ${username}`);
}

const display_player = (player: Player) => {
	const username_span = document.getElementById("username") as HTMLSpanElement;
	const user_avatar_img = document.getElementById("user_avatar") as HTMLImageElement;
	const user_elo_span = document.getElementById("user_elo") as HTMLSpanElement;
	username_span.innerText = player.nickname;
	user_avatar_img.src = `https://mineskin.eu/helm/${player.uuid}`;
	user_elo_span.innerText = player.eloRate === null ? "Unrated" : `${player.eloRate} ELO`;
}

interface Cache {
	after: number,
	results: VersusResults,
	num_loaded: number,
}

const load_cache = (uuid: string): Cache | null => {
	const CURRENT_VERSION = "2";
	const prev_version = localStorage.getItem("version");

	if (prev_version !== CURRENT_VERSION) {
		localStorage.clear();
		localStorage.setItem("version", CURRENT_VERSION);
		return null;
	}

	const results: VersusResults = JSON.parse(localStorage.getItem(`results_${uuid}`) ?? "{}");
	return {
		after: parseInt(localStorage.getItem(`after_${uuid}`) ?? "1"),
		results,
		num_loaded: Object.values(results).reduce((partial, curr) => partial + curr.total, 0),
	};
}

const update_loading_status = (done: boolean, num_loaded: number) => {
	const text = done ?
		`Loaded ${num_loaded} matches` :
		`Loading ${num_loaded} matches...`;
	const loading_status = document.getElementById("loading_status") as HTMLSpanElement;
	loading_status.innerText = text;
}

interface NewMatches {
	matches: Match[],
	new_after: number,
}
const get_matches = async (uuid: string, cache: Cache | null): Promise<NewMatches> => {
	let before = null;
	let after = cache?.after ?? 1;
	let num_loaded = cache?.num_loaded ?? 0;
	let total_matches: Match[] = [];
	let errors = 0;
	const MAX_ERRORS = 3;

	while (true) {
		let matches_url = `https://api.mcsrranked.com/users/${uuid}/matches?count=${MATCHES_PER_LOAD}&excludedecay=true&type=2&after=${after}`;
		if (before !== null)
			matches_url += `&before=${before}`;

		update_loading_status(false, num_loaded + MATCHES_PER_LOAD);
		let new_matches: Match[];
		try {
			new_matches = await fetch_api(matches_url, `Could not load matches. Retrying ${errors + 1}/${MAX_ERRORS}`);
		} catch (err) {
			errors += 1;
			console.warn(`Error ${errors}/${MAX_ERRORS}`, err);
			if (errors > MAX_ERRORS)
				break;
			continue;
		}
		total_matches.push(...new_matches);
		num_loaded += new_matches.length;
		before = new_matches.reduce((prev_id, match) => Math.min(match.id, prev_id), before ?? Infinity);

		if (new_matches.length < MATCHES_PER_LOAD) {
			update_loading_status(true, num_loaded);
			break;
		}
	}

	let new_after = Math.max(...total_matches.map((m) => m.id));
	new_after = isFinite(new_after) ? new_after : after;
	return {
		matches: total_matches,
		new_after,
	};
}

const matches_to_datas = (uuid: string, new_matches: Match[]): VersusDatas => {
	const versus_datas: VersusDatas = {};
	for (const match of new_matches) {
		const opponent = match.players.find((opp: Player) => opp.uuid != uuid);
		if (opponent === undefined) {
			console.warn("Could not find opponent in match", match);
			continue;
		}

		const curr_data = versus_datas[opponent.uuid];
		if (curr_data) {
			curr_data.matches.push(match);
			curr_data.opponent = opponent;
		} else
			versus_datas[opponent.uuid] = {
				opponent,
				matches: [match],
			};
	}

	return versus_datas;
}

const process_datas = (uuid: string, results: VersusResults, datas: VersusDatas): VersusResults => {
	for (const [opp_uuid, data] of Object.entries(datas)) {
		if (!(opp_uuid in results)) {
			results[opp_uuid] = {
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
		const result = results[opp_uuid] as VsResult;
		result.opponent = data.opponent;

		for (const match of data.matches) {
			const won = match.result?.uuid === uuid;
			const drew = match.result?.uuid === null;
			const completed = !match.forfeited;
			const elo_change = match.changes.find((ch) => ch.uuid === uuid)?.change;
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
		}
	}

	for (const result of Object.values(results)) {
		result.win_average = result.win_completions > 0 ?
			Math.round(result.win_completions_time / result.win_completions / 1000)
			: null;
		result.loss_average = result.loss_completions > 0 ?
			Math.round(result.loss_completions_time / result.loss_completions / 1000)
			: null;
	}

	return results;
}

const save_cache = (uuid: string, results: VersusResults, after: number) => {
	localStorage.setItem(`after_${uuid}`, after.toString());
	localStorage.setItem(`results_${uuid}`, JSON.stringify(results));
}

let opponent_card_node: HTMLDivElement | undefined = undefined;
const display_opponents = (player: Player, all_results: VersusResults) => {
	if (opponent_card_node === undefined) {
		console.error("Cound not find opponent card node, exiting...");
		return;
	}
	const opponents = document.getElementById("opponents") as HTMLDivElement;
	opponents.replaceChildren();

	let filtered_results = filter_results(Object.values(all_results));
	filtered_results = sort_results(filtered_results);

	const opponent_nodes = [];
	for (const result of filtered_results) {
		let win_time = "--", loss_time = "--";

		if (result.win_average !== null)
			win_time = time_to_string(result.win_average);
		if (result.loss_average !== null)
			loss_time = time_to_string(result.loss_average);

		const new_card_node = opponent_card_node.cloneNode(true) as HTMLDivElement;

		(new_card_node.querySelector(".opponent_avatar") as HTMLImageElement).src = `https://mineskin.eu/helm/${result.opponent.uuid}`;
		const opp_name = new_card_node.querySelector(".opponent_username") as HTMLAnchorElement;
		opp_name.innerText = result.opponent.nickname;
		opp_name.href = `./user.html?username=${result.opponent.nickname}`;

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

		(new_card_node.querySelector(".opponent_link") as HTMLAnchorElement).href = `https://mcsrranked.com/stats/${player.nickname}/vs/${result.opponent.nickname}`;

		const opponent_matches_elem = new_card_node.querySelector(".opponent_matches") as HTMLDivElement;
		const opponent_expand_elem = new_card_node.querySelector(".opponent_expand") as HTMLDivElement;
		opponent_expand_elem.addEventListener("click", async () => on_opponent_expand(player, result.opponent.uuid, opponent_expand_elem, opponent_matches_elem));

		opponent_nodes.push(new_card_node);
	}
	opponents.replaceChildren(...opponent_nodes);
}

const filter_results = (result_values: VsResult[]): VsResult[] => {
	return result_values.filter((res: any) => {
		filters: for (const [id, cmp, value] of sort_filter.filter_by) {
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
		for (const [id, reverse] of sort_filter.sort_by) {
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
		].findIndex((v) => v === value);
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
		sort_filter.filter_by[0][0] = filter_by_id;
		const filter_select_id = document.getElementById("filter_select_id") as HTMLSelectElement;
		filter_select_id.selectedIndex = id_to_index(filter_by_id);
	}

	const filter_cmp_id = params.get(FILTER_CMP_PARAM) as keyof VsResult | null;
	if (filter_cmp_id !== null) {
		let val = parseInt(filter_cmp_id);
		val = isNaN(val) ? 1 : val;
		sort_filter.filter_by[0][1] = val;
		const filter_select_cmp = document.getElementById("filter_select_cmp") as HTMLSelectElement;
		filter_select_cmp.selectedIndex = cmp_to_index(val);
	}

	const filter_value = params.get(FILTER_VALUE_PARAM) as keyof VsResult | null;
	if (filter_value !== null) {
		let val = parseInt(filter_value);
		val = isNaN(val) ? 1 : val;
		sort_filter.filter_by[0][2] = val;
		const filter_select_value = document.getElementById("filter_select_value") as HTMLSelectElement;
		filter_select_value.value = val.toString();
	}

	const sort_by_id = params.get(SORT_BY_PARAM) as keyof VsResult | null;
	if (sort_by_id !== null) {
		sort_filter.sort_by[0][0] = sort_by_id;
		const sort_select = document.getElementById("sort_select") as HTMLSelectElement;
		sort_select.selectedIndex = id_to_index(sort_by_id);
	}

	const sort_dir = params.get(SORT_DIR_PARAM);
	if (sort_dir !== null) {
		const val = sort_dir == "1";
		sort_filter.sort_by[0][1] = val;
		const sort_direction = document.getElementById("sort_direction") as HTMLElement;
		sort_direction.style.transform = val ? "" : "scale(1, -1)";
	}
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

	sort_filter.filter_by[0] = [filter_by, filter_cmp, filter_value];
}

const on_sort_change = () => {
	const sort_select = document.getElementById("sort_select") as HTMLSelectElement;
	const sort_by = sort_select.value as keyof VsResult;
	if (sort_by === undefined)
		return;

	update_url(SORT_BY_PARAM, sort_by);

	sort_filter.sort_by[0][0] = sort_by;
}
const on_sort_direction_change = () => {
	const dir = !sort_filter.sort_by[0][1];
	sort_filter.sort_by[0][1] = dir;
	const sort_direction = document.getElementById("sort_direction") as HTMLElement;
	sort_direction.style.transform = dir ? "" : "scale(1, -1)";

	update_url(SORT_DIR_PARAM, +dir);
}

let opponent_match_node: HTMLAnchorElement | undefined = undefined;
const on_opponent_expand = async (player: Player, opp_uuid: string, opponent_expand_elem: HTMLDivElement, opponent_matches_elem: HTMLDivElement) => {
	if (opponent_matches_elem.style.display === "none") {
		opponent_matches_elem.style.display = "";
		opponent_expand_elem.classList.add("expanded");
	} else {
		opponent_matches_elem.style.display = "none";
		opponent_expand_elem.classList.remove("expanded");
	}

	const versus_url = `https://api.mcsrranked.com/users/${player.uuid}/versus/${opp_uuid}/matches?count=100&type=2`;
	const matches = await fetch_api<Match[]>(versus_url, "Could not load versus matches");

	if (opponent_match_node === undefined) {
		console.warn("Cannot find opponent match");
		return;
	}

	let match_nodes = [];
	for (const match of matches) {
		const new_match_node = opponent_match_node.cloneNode(true) as HTMLAnchorElement;
		new_match_node.href = `https://mcsrranked.com/stats/${player.nickname}/${match.id}?matches=ranked&sort=newest`

		const time_str = time_to_string(match.result.time / 1000);
		const time = new_match_node.querySelector(".match_time") as HTMLElement;
		time.innerText = time_str;
		if (match.result.uuid === null)
			time.classList.add("draws");
		else if (match.result.uuid === player.uuid)
			time.classList.add("wins");
		else
			time.classList.add("losses");

		const FORFEIT_URL = "./static/forfeit.png";
		const COMPLETION_URL = "./static/completion.png";
		const forfeit_img = new_match_node.querySelector(".match_forfeit") as HTMLImageElement;
		forfeit_img.src = match.forfeited ? FORFEIT_URL : COMPLETION_URL;
		forfeit_img.title = match.result.uuid === null ? "drew" : (match.forfeited ? "forfeited" : "completed");

		match_nodes.push(new_match_node);
	}
	opponent_matches_elem.replaceChildren(...match_nodes);
}
